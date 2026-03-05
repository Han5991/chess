import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Chess — Stockfish 18",
  description:
    "브라우저에서 바로 Stockfish 18 AI와 체스 대결. 서버 없이 100% 클라이언트 사이드.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
