import { useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Chatbot from "../components/Chatbot";

function Layout({ children }) {
  const location = useLocation();
  const isAssistantPage = location.pathname === "/assistant";

  return (
    <>
      <Navbar />
      {children}
      {!isAssistantPage && <Footer />}
      {!isAssistantPage && <Chatbot />}
    </>
  );
}

export default Layout;