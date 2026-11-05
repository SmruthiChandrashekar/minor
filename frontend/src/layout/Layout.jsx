import { useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Chatbot from "../components/Chatbot";
import { useAuth } from "../context/AuthProvider";

function Layout({ children }) {
  const location = useLocation();
  const { user } = useAuth();
  const isAssistantPage = location.pathname === "/assistant";
  // The Puravankara website simulation pages bring their own header and footer.
  const isSimulation = location.pathname === "/" || location.pathname.startsWith("/residential");

  if (isSimulation) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      {children}
      {!isAssistantPage && <Footer />}
      {!isAssistantPage && user && <Chatbot />}
    </>
  );
}

export default Layout;