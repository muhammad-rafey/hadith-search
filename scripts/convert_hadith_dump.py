#!/usr/bin/env python3
"""Convert MariaDB dump of HadithTable to Postgres SQL.

Reads /Users/me/Downloads/HadithTable.sql (single MariaDB dump).
Writes:
  supabase/migrations/0003_hadith_table_raw.sql   (DDL only)
  supabase/seed/hadith_table/NNN.sql              (one INSERT per file, <= ~2 MB)
"""

from __future__ import annotations

import os
import re
import sys

SRC = "/Users/me/Downloads/HadithTable.sql"
ROOT = "/Users/me/Projects/hadith-search"
DDL_OUT = os.path.join(ROOT, "supabase/migrations/0003_hadith_table_raw.sql")
SEED_DIR = os.path.join(ROOT, "supabase/seed/hadith_table")

TABLE = "public.hadith_table"


def quoted(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def convert_mysql_string_body(body: str) -> str:
    """Decode MySQL backslash escapes, then encode for a standard Postgres string literal."""
    out: list[str] = []
    i = 0
    n = len(body)
    while i < n:
        c = body[i]
        if c == "\\" and i + 1 < n:
            nxt = body[i + 1]
            if nxt == "\\":
                out.append("\\")
                i += 2
            elif nxt == "'":
                out.append("'")
                i += 2
            elif nxt == '"':
                out.append('"')
                i += 2
            elif nxt == "n":
                out.append("\n")
                i += 2
            elif nxt == "r":
                out.append("\r")
                i += 2
            elif nxt == "t":
                out.append("\t")
                i += 2
            elif nxt == "0":
                # Postgres rejects NUL in text — drop. Spot-check: not present in dump.
                i += 2
            elif nxt == "Z":
                out.append("\x1a")
                i += 2
            elif nxt == "b":
                out.append("\b")
                i += 2
            else:
                # MySQL: backslash before any other char is just that char.
                out.append(nxt)
                i += 2
        else:
            out.append(c)
            i += 1
    decoded = "".join(out)
    return decoded.replace("'", "''")


def convert_values_text(text: str) -> str:
    """Walk a row line, rewriting backtick idents and MySQL string literals."""
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c == "'":
            j = i + 1
            buf: list[str] = []
            while j < n:
                d = text[j]
                if d == "\\" and j + 1 < n:
                    buf.append(d)
                    buf.append(text[j + 1])
                    j += 2
                elif d == "'":
                    j += 1
                    break
                else:
                    buf.append(d)
                    j += 1
            body = "".join(buf)
            out.append("'")
            out.append(convert_mysql_string_body(body))
            out.append("'")
            i = j
        elif c == "`":
            j = i + 1
            while j < n and text[j] != "`":
                j += 1
            ident = text[i + 1 : j]
            out.append(quoted(ident))
            i = j + 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def build_ddl(ddl_body: str, column_order: list[str]) -> str:
    """Parse the CREATE TABLE body into Postgres DDL.

    column_order is returned via the side channel so we can emit an explicit
    column list in the INSERTs (defense-in-depth against schema drift).
    """
    raw_lines = [l.strip().rstrip(",") for l in ddl_body.strip().splitlines() if l.strip()]
    cols: list[tuple[str, str]] = []
    pk: list[str] = []
    uniques: list[list[str]] = []
    indexes: list[tuple[str, list[str]]] = []

    for ln in raw_lines:
        if ln.startswith("PRIMARY KEY"):
            m = re.match(r"PRIMARY KEY \((.+)\)", ln)
            if m:
                pk = [c.strip().strip("`") for c in m.group(1).split(",")]
        elif ln.startswith("UNIQUE KEY"):
            m = re.match(r"UNIQUE KEY `[^`]+` \((.+)\)", ln)
            if m:
                uniques.append([c.strip().strip("`") for c in m.group(1).split(",")])
        elif ln.startswith("KEY "):
            m = re.match(r"KEY `([^`]+)` \((.+)\)", ln)
            if m:
                indexes.append((m.group(1), [c.strip().strip("`") for c in m.group(2).split(",")]))
        elif ln.startswith("`"):
            m = re.match(r"`([^`]+)` (.+)", ln)
            if not m:
                continue
            name = m.group(1)
            rest = m.group(2)
            rest = re.sub(r"\s*COLLATE\s+\S+", "", rest)
            rest = re.sub(r"\s*CHARACTER SET\s+\S+", "", rest)
            # Postgres-friendly type tweaks
            rest = re.sub(r"\btimestamp\b", "timestamptz", rest)
            # Drop MySQL-specific "DEFAULT NULL" — Postgres treats columns as nullable by default
            rest = re.sub(r"\s*DEFAULT NULL\s*", " ", rest)
            cols.append((name, rest.strip()))

    parts: list[str] = []
    parts.append("-- =========================================================================")
    parts.append("-- 0003_hadith_table_raw.sql")
    parts.append("-- Raw 1:1 mirror of MariaDB dump (sunnah-db / HadithTable).")
    parts.append("-- Identifiers preserved in camelCase via double-quotes.")
    parts.append("-- =========================================================================")
    parts.append("")
    parts.append(f"create table if not exists {TABLE} (")
    body_lines: list[str] = []
    for name, typ in cols:
        body_lines.append(f"  {quoted(name)} {typ}")
    if pk:
        body_lines.append(f"  primary key ({', '.join(quoted(c) for c in pk)})")
    parts.append(",\n".join(body_lines))
    parts.append(");")
    parts.append("")

    seen_unique_pk = False
    for cols_in_uq in uniques:
        if cols_in_uq == pk:
            seen_unique_pk = True
            continue
        nm = "_".join(c.lower() for c in cols_in_uq)
        parts.append(
            f"create unique index if not exists hadith_table_{nm}_key on {TABLE} "
            f"({', '.join(quoted(c) for c in cols_in_uq)});"
        )
    for nm, cols_in_idx in indexes:
        parts.append(
            f"create index if not exists hadith_table_{nm}_idx on {TABLE} "
            f"({', '.join(quoted(c) for c in cols_in_idx)});"
        )
    parts.append("")
    parts.append("-- Read-only public reference data (mirrors the policy in 0001_init.sql).")
    parts.append(f"alter table {TABLE} enable row level security;")
    parts.append(f'create policy "hadith_table_read_all" on {TABLE} for select using (true);')
    parts.append("")

    column_order.extend(name for name, _ in cols)
    if seen_unique_pk:
        pass  # explicit unique on PK column is redundant — silently skipped above
    return "\n".join(parts)


HEADER_RE = re.compile(r"^INSERT INTO `HadithTable` VALUES\s*$")


def main() -> int:
    with open(SRC, "r", encoding="utf-8") as f:
        data = f.read()

    # ----- DDL -----
    m = re.search(r"CREATE TABLE `HadithTable` \(\n(.+?)\n\) ENGINE=", data, re.DOTALL)
    if not m:
        print("CREATE TABLE block not found", file=sys.stderr)
        return 1
    column_order: list[str] = []
    ddl = build_ddl(m.group(1), column_order)
    os.makedirs(os.path.dirname(DDL_OUT), exist_ok=True)
    with open(DDL_OUT, "w", encoding="utf-8") as f:
        f.write(ddl)
    print(f"DDL written -> {DDL_OUT} ({len(ddl)} bytes, {len(column_order)} columns)")

    # ----- Data chunks -----
    # Target ~200 KB per chunk so each fits in one Read() (256 KB cap) + one
    # MCP execute_sql() call comfortably. Chunk on row boundaries.
    os.makedirs(SEED_DIR, exist_ok=True)
    column_list = ", ".join(quoted(c) for c in column_order)
    insert_header = f"insert into {TABLE} ({column_list}) values\n"
    target_chunk_bytes = 200 * 1024

    chunk_idx = 0
    total_rows = 0
    current_rows: list[str] = []
    current_size = 0
    in_insert = False

    def flush() -> None:
        nonlocal chunk_idx, current_rows, current_size
        if not current_rows:
            return
        body = ",\n".join(current_rows) + ";\n"
        out_path = os.path.join(SEED_DIR, f"{chunk_idx:04d}.sql")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(insert_header)
            f.write(body)
        chunk_idx += 1
        current_rows = []
        current_size = 0

    for raw_line in data.splitlines():
        if HEADER_RE.match(raw_line):
            in_insert = True
            continue
        if not in_insert:
            continue
        if raw_line.startswith("("):
            s = raw_line.rstrip()
            if s and s[-1] in (",", ";"):
                s = s[:-1]
            converted = convert_values_text(s)
            row_bytes = len(converted.encode("utf-8"))
            if current_size + row_bytes > target_chunk_bytes and current_rows:
                flush()
            current_rows.append(converted)
            current_size += row_bytes + 2  # ",\n"
            total_rows += 1
        else:
            in_insert = False

    flush()

    print(f"Chunks written: {chunk_idx} -> {SEED_DIR}")
    print(f"Total rows: {total_rows}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
