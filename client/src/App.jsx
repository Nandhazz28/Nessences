import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/navigation/Header.jsx';
import { Footer } from './components/navigation/Footer.jsx';
import { LockIcon } from './components/common/Icon.jsx';
import { Spinner } from './components/common/States.jsx';
import { CartDrawer } from './components/cart/CartDrawer.jsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';

const Home = lazy(() => import('./pages/Home.jsx'));
const Shop = lazy(() => import('./pages/Shop.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const result = (n) => lazy(() => import('./pages/CheckoutResult.jsx').then((m) => ({ default: m[n] })));
const CheckoutSuccess = result('CheckoutSuccess'), CheckoutFailed = result('CheckoutFailed');
const AccountLayout = lazy(() => import('./pages/account/AccountLayout.jsx'));
const acctOrders = (n) => lazy(() => import('./pages/account/AccountOrders.jsx').then((m) => ({ default: m[n] })));
const acctProfile = (n) => lazy(() => import('./pages/account/AccountProfile.jsx').then((m) => ({ default: m[n] })));
const Orders = acctOrders('Orders'), OrderDetail = acctOrders('OrderDetail'), NewReturn = acctOrders('NewReturn'), Returns = acctOrders('Returns'), ReturnDetail = acctOrders('ReturnDetail');
const Profile = acctProfile('Profile'), Addresses = acctProfile('Addresses'), Notifications = acctProfile('Notifications'), Settings = acctProfile('Settings'), Security = acctProfile('Security');
const AccountReviews = lazy(() => import('./pages/account/AccountReviews.jsx'));
const ContentPage = lazy(() => import('./pages/ContentPage.jsx'));
const nl = (n) => lazy(() => import('./pages/Newsletter.jsx').then((m) => ({ default: m[n] })));
const NewsletterConfirm = nl('NewsletterConfirm'), NewsletterUnsubscribe = nl('NewsletterUnsubscribe');
const CONTENT_ROUTES = ['about', 'shipping', 'returns-policy', 'refund-policy', 'size-guide', 'faq', 'privacy', 'terms', 'cookie-policy', 'careers'];
const Contact = lazy(() => import('./pages/Contact.jsx'));
const TrackOrder = lazy(() => import('./pages/TrackOrder.jsx'));
const jr = (n) => lazy(() => import('./pages/Journal.jsx').then((m) => ({ default: m[n] })));
const Journal = jr('Journal'), JournalArticle = jr('JournalArticle');
const col = (n) => lazy(() => import('./pages/Collections.jsx').then((m) => ({ default: m[n] })));
const Collections = col('Collections'), CollectionDetail = col('CollectionDetail');
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const auth = (name) => lazy(() => import('./pages/Auth.jsx').then((m) => ({ default: m[name] })));
const Login = auth('Login'), Register = auth('Register'), VerifyEmail = auth('VerifyEmail'), ForgotPassword = auth('ForgotPassword'), ResetPassword = auth('ResetPassword');

// After a route change: back to the top, focus on <main> so keyboard users continue from the new page, and the new title
// announced to screen readers (a single-page app gives them no other signal that anything happened).
function RouteFocus() {
  const { pathname } = useLocation(); const first = useRef(true); const [msg, setMsg] = useState('');
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    window.scrollTo(0, 0); document.getElementById('main')?.focus({ preventScroll: true });
    const t = setTimeout(() => setMsg(document.title), 150);   // after the page has set its own title
    return () => clearTimeout(t);
  }, [pathname]);
  return <div role="status" aria-live="polite" className="sr-only">{msg}</div>;
}

function Layout() {
  return (
    <>
      <Header />
      <RouteFocus />
      <main id="main" tabIndex={-1}><ErrorBoundary><Suspense fallback={<Spinner />}><Outlet /></Suspense></ErrorBoundary></main>
      <Footer />
      <CartDrawer />
    </>
  );
}

// Distraction-free layout for checkout: brand + secure indicator only.
function CheckoutLayout() {
  return (
    <>
      <header className="border-b rule"><div className="wrap flex justify-between items-center h-16">
        <Link to="/" className="font-display text-2xl tracking-[0.04em]">NESSENCE</Link><span className="text-small text-muted inline-flex items-center gap-2"><LockIcon width={14} height={14} />Secure checkout</span></div></header>
      <RouteFocus />
      <main id="main" tabIndex={-1}><ErrorBoundary><Suspense fallback={<Spinner />}><Outlet /></Suspense></ErrorBoundary></main>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="admin/*" element={<Suspense fallback={<Spinner />}><AdminApp /></Suspense>} />
      <Route element={<CheckoutLayout />}>
        <Route path="checkout" element={<Checkout />} />
        <Route path="checkout/success" element={<CheckoutSuccess />} />
        <Route path="checkout/failed" element={<CheckoutFailed />} />
      </Route>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        {['men', 'women', 'new-arrivals', 'sale', 'search'].map((m) => <Route key={m} path={m} element={<Shop mode={m} />} />)}
        <Route path="products/:slug" element={<Product />} />
        <Route path="cart" element={<Cart />} />
        <Route path="wishlist" element={<Navigate to="/account/wishlist" replace />} />
        {CONTENT_ROUTES.map((k) => <Route key={k} path={k} element={<ContentPage contentKey={k} />} />)}
        <Route path="contact" element={<Contact />} />
        <Route path="track-order" element={<TrackOrder />} />
        <Route path="journal" element={<Journal />} />
        <Route path="journal/:slug" element={<JournalArticle />} />
        <Route path="collections" element={<Collections />} />
        <Route path="collections/:slug" element={<CollectionDetail />} />
        <Route path="returns" element={<Navigate to="/returns-policy" replace />} />
        <Route path="newsletter/confirm" element={<NewsletterConfirm />} />
        <Route path="newsletter/unsubscribe" element={<NewsletterUnsubscribe />} />
        <Route path="account" element={<AccountLayout />}>
          <Route path="profile" element={<Profile />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="orders/:id/return" element={<NewReturn />} />
          <Route path="returns" element={<Returns />} />
          <Route path="returns/:id" element={<ReturnDetail />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="reviews" element={<AccountReviews />} />
          <Route path="addresses" element={<Addresses />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
          <Route path="security" element={<Security />} />
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
