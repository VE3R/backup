import type { AppProps } from "next/app";
import "../styles/globals.css";
import { ToastProvider } from "../components/ToastProvider";
import { MotionConfig } from "framer-motion";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MotionConfig reducedMotion="never">
      <ToastProvider>
        <Component {...pageProps} />
      </ToastProvider>
    </MotionConfig>
  );
}
