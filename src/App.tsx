import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="cf-studio-theme">
      <Layout />
      <Toaster />
    </ThemeProvider>
  );
}

export default App;
