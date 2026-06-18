import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sala de operação — fundo escuro azulado
        base: {
          DEFAULT: "#0F1729", // fundo da app
          surface: "#1A2438", // cards / superfícies
          raised: "#232F49", // elementos elevados / hover
          border: "#2B3852", // bordas sutis
        },
        ink: {
          DEFAULT: "#E8ECF4", // texto principal
          muted: "#8A96AD", // texto secundário
          faint: "#5C6783", // texto terciário / labels
        },
        // Dourado de premiação — acento assinatura (ranking)
        gold: {
          DEFAULT: "#D4A636",
          soft: "#E8C875",
          dim: "#3A3217",
        },
        // Azul de ação
        action: {
          DEFAULT: "#3B82F6",
          dim: "#1E293B",
        },
        // Semânticas — usadas só onde têm significado
        win: "#22C55E", // fechado / positivo
        loss: "#EF4444", // perdido / negativo
        warn: "#F59E0B", // atenção / aguardando
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.18)",
        gold: "0 0 0 1px rgba(212,166,54,0.35), 0 8px 30px rgba(212,166,54,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
