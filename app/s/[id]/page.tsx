import { SessionDesk } from "@/components/SessionDesk";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionDesk id={id} />;
}
