import { useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Chatbot from "../components/Chatbot";
import { useAuth } from "../context/AuthProvider";

function Layout({ children }) {
  const location = useLocation();
  const { user } = useAuth();
  const isAssistantPage = location.pathname === "/assistant";

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