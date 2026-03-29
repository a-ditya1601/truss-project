const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/templates/**/*.html",
    "./app/static/js/**/*.js",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        ui: {
          bg: "#0B1120",
          surface: "#111827",
          primary: "#22C55E",
          secondary: "#38BDF8",
          danger: "#EF4444",
          text: "#E5E7EB",
          muted: "#9CA3AF",
        },
        accent: {
          DEFAULT: "#ff8c50",
          muted: "rgba(255,140,80,0.15)",
        },
      },
      boxShadow: {
        "panel-dark": "0 24px 60px -28px rgba(8, 15, 32, 0.78)",
        "glow-green": "0 0 0 1px rgba(34, 197, 94, 0.15), 0 20px 45px -24px rgba(34, 197, 94, 0.45)",
        "glow-warm": "0 0 30px rgba(255,140,80,0.15), 0 0 60px rgba(255,140,80,0.08)",
        "glow-warm-lg": "0 0 50px rgba(255,140,80,0.2), 0 0 100px rgba(255,140,80,0.1)",
        "card-hover": "0 8px 32px rgba(255,140,80,0.12), 0 0 0 1px rgba(255,255,255,0.08)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      animation: {
        "hero-fade-in": "heroFadeIn 0.8s ease-out forwards",
        "hero-fade-in-delay": "heroFadeIn 0.8s ease-out 0.15s forwards",
        "hero-fade-in-delay-2": "heroFadeIn 0.8s ease-out 0.3s forwards",
        "hero-fade-in-delay-3": "heroFadeIn 0.8s ease-out 0.45s forwards",
        "orb-pulse": "orbPulse 6s ease-in-out infinite",
        "orb-pulse-slow": "orbPulse 8s ease-in-out infinite",
      },
      keyframes: {
        heroFadeIn: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        orbPulse: {
          "0%, 100%": { opacity: "0.5", transform: "translate(-50%, 0) scale(1)" },
          "50%": { opacity: "0.8", transform: "translate(-50%, 0) scale(1.06)" },
        },
      },
    },
  },
  plugins: [],
};
