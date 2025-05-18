import { Inter } from "next/font/google";
import "./globals.css";
import Link from 'next/link';

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Sound Modem - ggwave",
  description: "A Next.js app that uses ggwave to send and receive data over sound",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="bg-white dark:bg-gray-800 shadow">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <div className="flex-shrink-0">
                <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Sound Modem</h1>
              </div>
              <div className="flex space-x-4">
                <Link href="/" className="text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium">
                  Receiver
                </Link>
                <Link href="/transmit" className="text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-md text-sm font-medium">
                  Transmitter
                </Link>
              </div>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
