import DashboardShell from "@/components/DashboardShell";

const links = [
  { href: "/employer", label: "Dashboard", icon: "dashboard" },
  // add your other employer routes here, e.g.:
  // { href: "/employer/jobs/new", label: "Post a job", icon: "add" },
];

export default function EmployerLayout({ children }) {
  return <DashboardShell title="Employer" links={links}>{children}</DashboardShell>;
}
