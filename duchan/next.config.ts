import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // כל המדיה מוגשת מ-R2 דרך דומיין ציבורי; אין צורך באופטימיזציית תמונות של Next
    unoptimized: true,
  },
};

export default nextConfig;
