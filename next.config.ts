import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
    ],
  },
  // 配置 webpack 以支持 Node.js 模块
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 在服务端环境中允许使用这些 Node.js 模块
      config.externals = config.externals || [];
      config.externals.push({
        'proxy-agent': 'commonjs proxy-agent',
      });
    }
    return config;
  },
};

export default nextConfig;
