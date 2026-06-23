/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins:
        process.env.NODE_ENV === "development"
          ? [
              "localhost:3000",
              "127.0.0.1:3000",
              "*.githubpreview.dev",
              "*.github.dev",
              "*.codespaces.app",
            ]
          : undefined,
    },
  },
};

export default nextConfig;
