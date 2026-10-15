import { useLocation } from "react-router-dom";
import { useCart } from "../../context/CartContext.jsx";

export function Notice() {
  const { notice, setNotice, drawerOpen } = useCart();
  const { pathname } = useLocation();
  if (!notice || drawerOpen || pathname === "/cart") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none"
    >
      <p className="pointer-events-auto bg-ink text-paper text-small px-4 py-3 max-w-md flex items-start gap-4">
        <span>{notice}</span>
        <button
          type="button"
          className="underline shrink-0"
          onClick={() => setNotice("")}
        >
          Dismiss
        </button>
      </p>
    </div>
  );
}
