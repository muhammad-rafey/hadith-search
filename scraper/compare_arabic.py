import csv, re, sys, unicodedata

SQL = "/home/me/Downloads/HadithTable (2).sql"
CSV = "/home/me/Hadees/hadith-search/scraper/out/sunnah_urdu.csv"

# ---------- normalization ----------
TAG_RE = re.compile(r'\[/?(?:prematn|matn|narrator)[^\]]*\]')
DIAC_RE = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')  # harakat + tatweel
def strip_markup(s):
    return TAG_RE.sub('', s)
def norm(s, drop_diac=False):
    s = strip_markup(s)
    # normalize fancy quotes/ornament chars used by sunnah.com
    s = s.replace('‏','').replace('‎','')
    s = s.replace('‏','').replace('"','"').replace('"','"')
    if drop_diac:
        s = DIAC_RE.sub('', s)
    # unify all whitespace and punctuation spacing
    s = re.sub(r'[\s ]+',' ', s)
    # keep only arabic letters + spaces for a robust compare
    return s
def letters_only(s):
    s = strip_markup(s)
    s = DIAC_RE.sub('', s)
    return ''.join(ch for ch in s if 'ء' <= ch <= 'ي')

# ---------- parse SQL dump ----------
def parse_rows(text):
    # find each INSERT ... VALUES block
    i = 0
    rows = []
    n = len(text)
    while True:
        idx = text.find("INSERT INTO `HadithTable` VALUES", i)
        if idx == -1: break
        i = idx + len("INSERT INTO `HadithTable` VALUES")
        # parse tuples until ';' at top level
        while i < n:
            # skip whitespace/commas
            while i < n and text[i] in ' \r\n\t,': i += 1
            if i < n and text[i] == ';':
                i += 1; break
            if i >= n or text[i] != '(':
                break
            i += 1  # past '('
            fields = []
            cur = []
            in_str = False
            while i < n:
                c = text[i]
                if in_str:
                    if c == '\\':
                        cur.append(text[i+1]); i += 2; continue
                    if c == "'":
                        in_str = False; i += 1; continue
                    cur.append(c); i += 1; continue
                else:
                    if c == "'":
                        in_str = True; i += 1; continue
                    if c == ',':
                        fields.append(''.join(cur)); cur=[]; i+=1; continue
                    if c == ')':
                        fields.append(''.join(cur)); cur=[]; i+=1; break
                    cur.append(c); i += 1; continue
            rows.append(fields)
    return rows

print("Reading SQL...", file=sys.stderr)
with open(SQL, encoding='utf-8', errors='replace') as f:
    text = f.read()
rows = parse_rows(text)
print(f"SQL rows parsed: {len(rows)}", file=sys.stderr)

# build index: (collection, hadithNumber) -> arabicText
sql_idx = {}
sql_dups = 0
for r in rows:
    if len(r) < 10: continue
    coll = r[0]; had = r[5]; ar = r[9]
    key = (coll, had)
    if key in sql_idx: sql_dups += 1
    sql_idx[key] = ar
print(f"SQL unique keys: {len(sql_idx)}, dup keys: {sql_dups}", file=sys.stderr)

# ---------- read CSV ----------
csv.field_size_limit(10**7)
with open(CSV, encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    csv_rows = list(reader)
print(f"CSV rows: {len(csv_rows)}", file=sys.stderr)

# ---------- compare ----------
stats = {'total':0,'matched_key':0,'nokey':0,
         'exact_norm':0,'exact_letters':0,'mismatch':0}
mismatches = []
nokeys = []
for cr in csv_rows:
    stats['total'] += 1
    coll = cr['collection']; had = cr['hadithNumber']
    key = (coll, had)
    if key not in sql_idx:
        stats['nokey'] += 1
        nokeys.append(key)
        continue
    stats['matched_key'] += 1
    a_csv = cr['arabicText'] or ''
    a_sql = sql_idx[key]
    if norm(a_csv, True).strip() == norm(a_sql, True).strip():
        stats['exact_norm'] += 1
    elif letters_only(a_csv) == letters_only(a_sql):
        stats['exact_letters'] += 1
    else:
        stats['mismatch'] += 1
        mismatches.append((key, a_csv, a_sql))

print("\n===== COMPARISON SUMMARY =====")
for k,v in stats.items():
    print(f"{k:15}: {v}")
print(f"\nText agreement among key-matched rows: "
      f"{stats['exact_norm']+stats['exact_letters']}/{stats['matched_key']}")

# show a few example nokeys
from collections import Counter
print("\nCSV rows with no matching SQL key by collection:",
      Counter(k[0] for k in nokeys))
print("Sample missing keys:", nokeys[:10])

# write mismatches detail
with open('/home/me/scrap/out/arabic_mismatches.txt','w',encoding='utf-8') as out:
    for key, a_csv, a_sql in mismatches:
        out.write(f"### {key}\n")
        out.write("CSV : " + letters_only(a_csv)[:400] + "\n")
        out.write("SQL : " + letters_only(a_sql)[:400] + "\n")
        out.write("CSVlen=%d SQLlen=%d\n\n" % (len(letters_only(a_csv)), len(letters_only(a_sql))))
print(f"\nMismatch details -> /home/me/scrap/out/arabic_mismatches.txt ({len(mismatches)} rows)")

print("\n\n========== DEEPER RECONCILIATION ==========")
# Expand SQL combined hadithNumbers into individual numbers -> set of arabic texts per (coll,num)
import re as _re
def expand(hn):
    hn=hn.strip()
    nums=[]
    for part in hn.split(','):
        part=part.strip()
        m=_re.match(r'^(\d+)\s*-\s*(\d+)$',part)
        if m:
            a,b=int(m.group(1)),int(m.group(2))
            nums+= [str(x) for x in range(a,b+1)]
        elif part.isdigit():
            nums.append(part)
        else:
            nums.append(part)
    return nums

sql_expand={}  # (coll,num)->list of arabic
for r in rows:
    if len(r)<10: continue
    coll=r[0]; ar=r[9]
    for num in expand(r[5]):
        sql_expand.setdefault((coll,num),[]).append(ar)

# recount: for each csv row, is its letters_only arabic present in ANY sql row of same collection
# Build per-collection set of letters_only arabic from SQL
from collections import defaultdict
sql_letters=defaultdict(set)
for r in rows:
    if len(r)<10: continue
    sql_letters[r[0]].add(letters_only(r[9]))

resolved_by_expand=0
resolved_by_textsearch=0
truly_absent=[]
recount={'nokey':0}
# re-evaluate the previously nokey rows
for cr in csv_rows:
    coll=cr['collection']; had=cr['hadithNumber']
    if (coll,had) in sql_idx: continue
    recount['nokey']+=1
    csl=letters_only(cr['arabicText'] or '')
    if (coll,had) in sql_expand and any(letters_only(a)==csl for a in sql_expand[(coll,had)]):
        resolved_by_expand+=1
    elif csl and csl in sql_letters[coll]:
        resolved_by_textsearch+=1
    else:
        truly_absent.append((coll,had,len(csl)))

print(f"Previously-missing keys: {recount['nokey']}")
print(f"  resolved by expanding combined SQL numbers: {resolved_by_expand}")
print(f"  resolved by exact arabic-text match elsewhere in same collection: {resolved_by_textsearch}")
print(f"  TRULY ABSENT from SQL (no matching arabic text): {len(truly_absent)}")
print("  sample truly-absent:", truly_absent[:15])

# For the 52 mismatches: how many are just numbering offsets (text exists elsewhere)?
off_by_num=0; real_textdiff=[]
for key,a_csv,a_sql in mismatches:
    coll=key[0]; csl=letters_only(a_csv)
    if csl and csl in sql_letters[coll]:
        off_by_num+=1
    else:
        real_textdiff.append(key)
print(f"\nOf the 52 'mismatches':")
print(f"  CSV arabic text DOES exist elsewhere in SQL (pure numbering offset): {off_by_num}")
print(f"  genuine text differences not found anywhere in SQL: {len(real_textdiff)} -> {real_textdiff}")

print("\n========== RESIDUAL DETAIL ==========")
csv_by_key={}
for cr in csv_rows:
    csv_by_key.setdefault((cr['collection'],cr['hadithNumber']),cr)
suspect=[('bukhari', '581'), ('bukhari', '1447'), ('bukhari', '1243'), ('bukhari', '1774'), ('bukhari', '1802'), ('bukhari', '2523'), ('bukhari', '3060'), ('bukhari', '3689'), ('bukhari', '3789'), ('bukhari', '3906'), ('bukhari', '5472'), ('bukhari', '5515'), ('bukhari', '5652'), ('bukhari', '6792'), ('abudawud', '2386'), ('abudawud', '1581'), ('abudawud', '1582'), ('abudawud', '3033'), ('abudawud', '3034')]
empty_csv=0; nonempty=[]
for key in suspect:
    cr=csv_by_key.get(key)
    csl=letters_only(cr['arabicText'] or '') if cr else ''
    sl=letters_only(sql_idx[key]) if key in sql_idx else ''
    if len(csl)==0:
        empty_csv+=1
    else:
        nonempty.append((key,len(csl),len(sl)))
print(f"of 19 diffs: CSV arabic EMPTY: {empty_csv}; CSV has content: {len(nonempty)}")
for key,cl,sl in nonempty:
    print(f"  {key}: CSVlen={cl} SQLlen={sl}")
    cr=csv_by_key[key]
    print("    CSV:", letters_only(cr['arabicText'])[:200])
    print("    SQL:", letters_only(sql_idx[key])[:200])
