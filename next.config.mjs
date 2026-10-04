/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Native / WASM-heavy packages must not be bundled by webpack.
    serverComponentsExternalPackages: [
      'sharp',
      'imghash',
      '@huggingface/transformers',
      'onnxruntime-node',
    ],
    // Keep the serverless bundle under Vercel's 250 MB limit: drop binaries
    // for platforms that never run on Vercel (Linux x64 only).
    outputFileTracingExcludes: {
      '/api/search': [
        'node_modules/onnxruntime-node/bin/napi-v3/darwin/**',
        'node_modules/onnxruntime-node/bin/napi-v3/win32/**',
        'node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**',
        'node_modules/onnxruntime-web/**',
        'node_modules/@huggingface/transformers/dist/**/*.web.*',
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};
export default nextConfig;
