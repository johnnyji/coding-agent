import type { Metadata } from 'next'
import './globals.css'
import { Inter } from "next/font/google";
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Coding Agent',
  description: 'Autonomous coding orchestrator',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("h-full font-sans", inter.variable)}>
      <body className="h-full">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
