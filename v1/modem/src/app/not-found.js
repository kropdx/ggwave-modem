"use client";

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid place-items-center min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <main className="max-w-md w-full mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-8 text-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">404 - Page Not Found</h1>
          <p className="mt-4 text-gray-600 dark:text-gray-300">
            Sorry, we couldn&apos;t find the page you were looking for.
          </p>
        </div>

        <div className="flex flex-col space-y-4">
          <Link href="/" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-white font-medium">
            Go to Receiver
          </Link>
          <Link href="/transmit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-medium">
            Go to Transmitter
          </Link>
        </div>

        <div className="text-sm text-center text-gray-500 dark:text-gray-400 mt-8">
          <p>
            Powered by{" "}
            <a 
              href="https://github.com/ggerganov/ggwave" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              ggwave
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
