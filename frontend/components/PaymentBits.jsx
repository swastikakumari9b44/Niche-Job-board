import { Badge } from "./ui";

const LABEL = { paid: ["green", "Paid"], pending: ["amber", "Pending confirmation"], created: ["slate", "Not completed"], failed: ["red", "Failed"] };

export function PaymentStatusBadge({ status }) {
  const [tone, label] = LABEL[status] || ["slate", status];
  return <Badge tone={tone}>{label}</Badge>;
}
