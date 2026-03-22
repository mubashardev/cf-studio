import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import { SetupWizard } from "@/components/SetupWizard";
import { Toaster } from "@/components/ui/toaster";

function App() {
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
