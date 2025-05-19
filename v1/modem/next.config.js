/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static optimization for better performance on Vercel
  output: 'standalone',
  
  // Configure webpack for compatibility with ggwave
  webpack: (config, { isServer }) => {
    // Browser doesn't have fs, path, etc.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    
    // Add .js extensions for imports
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
    };
    
    return config;
  },
  
  // Force trailing slashes for consistency
  trailingSlash: true,
  
  // Ensure pages are properly detected
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
}

module.exports = nextConfig
