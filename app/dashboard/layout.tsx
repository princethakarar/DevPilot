import { Metadata } from "next";
import { Oxanium, JetBrains_Mono, Montserrat } from 'next/font/google';

const oxanium = Oxanium({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-oxanium',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-jetbrains',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-montserrat',
});

export const metadata: Metadata = {
  title: "Dashboard - DevPilot",
};

export default function DashboardLayout({
    children,
}:{
    children: React.ReactNode;
}){
    return(
        <div className={`${oxanium.variable} ${jetbrainsMono.variable} ${montserrat.variable} font-oxanium text-[#e8f4ff] bg-[#050d1a] min-h-screen w-full overflow-x-hidden selection:bg-[rgba(0,180,255,0.3)] selection:text-white`}>
            {children}
        </div>
    )
}