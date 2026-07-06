import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Role } from "./lib/api";
import { useAuth, homeForRole } from "./lib/auth";
import { Spinner } from "./components/ui";
import PublicLayout from "./components/PublicLayout";
import PortalLayout, { PortalNavItem } from "./components/PortalLayout";

// Public surface
import Home from "./pages/public/Home";
import Schemes from "./pages/public/Schemes";
import SchemeDetail from "./pages/public/SchemeDetail";
import Ledger from "./pages/public/Ledger";
import About from "./pages/public/About";
import NotFound from "./pages/public/NotFound";

// Auth
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import ForgotPassword from "./pages/auth/ForgotPassword";

// Citizen
import CitizenDashboard from "./pages/citizen/Dashboard";
import Apply from "./pages/citizen/Apply";
import Wallet from "./pages/citizen/Wallet";
import History from "./pages/citizen/History";
import Notifications from "./pages/citizen/Notifications";

// Vendor
import VendorDashboard from "./pages/vendor/Dashboard";
import VendorRedemptions from "./pages/vendor/Redemptions";
import VendorApply from "./pages/vendor/Apply";

// Admin
import AdminOverview from "./pages/admin/Overview";
import AdminSchemes from "./pages/admin/Schemes";
import AdminApplications from "./pages/admin/Applications";
import AdminDisbursement from "./pages/admin/Disbursement";
import AdminRedemptions from "./pages/admin/Redemptions";
import AdminVendors from "./pages/admin/Vendors";
import AdminAnomalies from "./pages/admin/Anomalies";

// RBI
import RbiTreasury from "./pages/rbi/Treasury";
import RbiRedemptions from "./pages/rbi/Redemptions";
import RbiDisbursement from "./pages/rbi/Disbursement";
import RbiAnomalies from "./pages/rbi/Anomalies";

function FullLoading() {
  return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}><Spinner size={32} /></div>;
}

/** Layout route that gates a portal to one or more roles. */
function RequireRole({ roles }: { roles: Role[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return <Outlet />;
}

const CITIZEN_NAV: PortalNavItem[] = [
  { to: "/citizen", label: "cznav.dashboard", icon: "grid", end: true },
  { to: "/citizen/apply", label: "cznav.apply", icon: "file" },
  { to: "/citizen/wallet", label: "cznav.wallet", icon: "wallet" },
  { to: "/citizen/history", label: "cznav.history", icon: "clock" },
  { to: "/citizen/notifications", label: "cznav.notifications", icon: "bell" },
];
const VENDOR_NAV: PortalNavItem[] = [
  { to: "/vendor", label: "vnnav.dashboard", icon: "grid", end: true },
  { to: "/vendor/redemptions", label: "vnnav.redemptions", icon: "refresh" },
  { to: "/vendor/apply", label: "vnnav.enrollment", icon: "store" },
];
const ADMIN_NAV: PortalNavItem[] = [
  { to: "/admin", label: "Overview", icon: "grid", end: true },
  { to: "/admin/schemes", label: "Schemes", icon: "layers" },
  { to: "/admin/applications", label: "Applications", icon: "file" },
  { to: "/admin/disbursement", label: "Disbursement", icon: "send" },
  { to: "/admin/redemptions", label: "Redemptions", icon: "refresh" },
  { to: "/admin/vendors", label: "Vendors", icon: "store" },
  { to: "/admin/anomalies", label: "Anomalies", icon: "alert" },
];
const RBI_NAV: PortalNavItem[] = [
  { to: "/rbi", label: "Treasury", icon: "building", end: true },
  { to: "/rbi/redemptions", label: "Redemptions", icon: "refresh" },
  { to: "/rbi/disbursement", label: "Disbursement", icon: "send" },
  { to: "/rbi/anomalies", label: "Anomalies", icon: "alert" },
];

export default function App() {
  return (
    <Routes>
      {/* ---------- Public site ---------- */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/schemes" element={<Schemes />} />
        <Route path="/schemes/:id" element={<SchemeDetail />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* ---------- Auth (full screen) ---------- */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* ---------- Citizen portal ---------- */}
      <Route element={<RequireRole roles={["CITIZEN"]} />}>
        <Route element={<PortalLayout roleLabel="portal.citizen" nav={CITIZEN_NAV} />}>
          <Route path="/citizen" element={<CitizenDashboard />} />
          <Route path="/citizen/apply" element={<Apply />} />
          <Route path="/citizen/apply/:id" element={<Apply />} />
          <Route path="/citizen/wallet" element={<Wallet />} />
          <Route path="/citizen/history" element={<History />} />
          <Route path="/citizen/notifications" element={<Notifications />} />
        </Route>
      </Route>

      {/* ---------- Vendor portal ---------- */}
      <Route element={<RequireRole roles={["VENDOR"]} />}>
        <Route element={<PortalLayout roleLabel="portal.vendor" nav={VENDOR_NAV} />}>
          <Route path="/vendor" element={<VendorDashboard />} />
          <Route path="/vendor/redemptions" element={<VendorRedemptions />} />
          <Route path="/vendor/apply" element={<VendorApply />} />
        </Route>
      </Route>

      {/* ---------- Admin portal ---------- */}
      <Route element={<RequireRole roles={["ADMIN"]} />}>
        <Route element={<PortalLayout roleLabel="Scheme Administration" nav={ADMIN_NAV} />}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/schemes" element={<AdminSchemes />} />
          <Route path="/admin/applications" element={<AdminApplications />} />
          <Route path="/admin/disbursement" element={<AdminDisbursement />} />
          <Route path="/admin/redemptions" element={<AdminRedemptions />} />
          <Route path="/admin/vendors" element={<AdminVendors />} />
          <Route path="/admin/anomalies" element={<AdminAnomalies />} />
        </Route>
      </Route>

      {/* ---------- RBI portal ---------- */}
      <Route element={<RequireRole roles={["RBI_ADMIN"]} />}>
        <Route element={<PortalLayout roleLabel="Reserve Bank of India" nav={RBI_NAV} />}>
          <Route path="/rbi" element={<RbiTreasury />} />
          <Route path="/rbi/redemptions" element={<RbiRedemptions />} />
          <Route path="/rbi/disbursement" element={<RbiDisbursement />} />
          <Route path="/rbi/anomalies" element={<RbiAnomalies />} />
        </Route>
      </Route>
    </Routes>
  );
}
