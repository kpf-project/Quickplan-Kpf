import { Geist, Geist_Mono, Noto_Sans_Thai_Looped } from "next/font/google";
import "./globals.css";
import SessionRefresher from "@/components/SessionRefresher";
import PwaServiceWorkerRegistrar from "@/components/PwaServiceWorkerRegistrar";
import WrapperRuntimeRecovery from "@/components/WrapperRuntimeRecovery";
import WebVitalsReporter from "@/components/WebVitalsReporter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansLooped = Noto_Sans_Thai_Looped({
  variable: "--font-noto-sans-looped",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: {
    default: "Quickplan PWA - KPF",
    template: "%s | Quickplan PWA"
  },
  description: "KPF Quickplan Management System - Employee scan and weighing workflow for efficient production tracking",
  keywords: ["production line", "manufacturing", "inventory", "KPF", "employee workflow", "scanning", "weighing"],
  authors: [{ name: "KPF Team" }],
  creator: "KPF",
  publisher: "KPF",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://kpf-production-line.vercel.app'),
  openGraph: {
    title: "Quickplan PWA - KPF",
    description: "KPF Quickplan Management System - Employee scan and weighing workflow",
    type: "website",
    locale: "th_TH",
    url: "/",
    siteName: "KPF Quickplan",
    images: [
      {
        url: "/icons/og-image.png",
        width: 1200,
        height: 630,
        alt: "KPF Quickplan Management System"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Quickplan PWA - KPF",
    description: "KPF Quickplan Management System - Employee scan and weighing workflow",
    images: ["/icons/og-image.png"],
    creator: "@kpf_thailand"
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon.svg",
    shortcut: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  other: {
    "msapplication-TileColor": "#102C57",
    "msapplication-config": "/browserconfig.xml"
  }
};

export const viewport = {
  themeColor: "#102C57",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={`${notoSansLooped.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <body
        className="bg-[#fdfaf7] text-[#102C57] antialiased font-sans"
      >
        <PwaServiceWorkerRegistrar />
        <WrapperRuntimeRecovery />
        <SessionRefresher />
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
