import { ImageResponse } from "next/og";
import { getHadithById } from "@/lib/hadiths";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await getHadithById(decodeURIComponent(id));
  const siteHost = getSiteUrl().replace(/^https?:\/\//, "");

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, #0d9f6e 0%, #0b6e4f 100%)",
        padding: "64px",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>
        Hadith Search · Sahih al-Bukhari
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1 }}>
          {h ? `Bukhari ${h.hadith_number}` : "Hadith"}
        </div>
        {h?.chapter_title_en ? (
          <div style={{ fontSize: 32, opacity: 0.92 }}>{h.chapter_title_en}</div>
        ) : null}
        {h ? (
          <div
            style={{
              fontSize: 24,
              opacity: 0.85,
              marginTop: 12,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {h.text_en.slice(0, 160)}
            {h.text_en.length > 160 ? "..." : ""}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", fontSize: 20, opacity: 0.75 }}>
        {h?.in_book_ref ?? siteHost}
      </div>
    </div>,
    size,
  );
}
