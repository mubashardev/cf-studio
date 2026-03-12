import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="cf-studio-theme">
      <Layout />
    </ThemeProvider>
  );
}

export default App;
