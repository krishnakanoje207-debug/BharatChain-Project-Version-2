import { EmptyState } from "../components/ui";

export default function Placeholder({ title = "Coming up", note }: { title?: string; note?: string }) {
  return <EmptyState icon="layers" title={title} note={note ?? "This screen is being built in the next pass of the frontend rebuild."} />;
}
