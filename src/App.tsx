import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import { SetupWizard } from "@/components/SetupWizard";
import { Toaster } from "@/components/ui/toaster";
import { ActivityDashboard } from "@/components/ActivityDashboard";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    // In Tauri v2, window label is available immediately on the window object
    // but we'll use the API for consistency and safety.
    setWindowLabel(getCurrentWindow().label);
  }, []);

  if (windowLabel === null) {
      return null; // Or a splash screen
  }

  if (windowLabel === "history") {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="cf-studio-theme">
        <ActivityDashboard />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="cf-studio-theme">
      <SetupWizard>
        <Layout />
      </SetupWizard>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;
