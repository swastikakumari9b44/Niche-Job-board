import DashboardShell from "@/components/DashboardShell";

const links = [
  { href: "/candidate/dashboard", label: "My applications", icon: "file" },
  { href: "/jobs", label: "Browse jobs", icon: "jobs" },
];

export default function CandidateLayout({ children }) {
  return <DashboardShell title="Candidate" links={links}>{children}</DashboardShell>;
}
