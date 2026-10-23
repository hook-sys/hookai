import { renderEditor } from "../editorPage";

export const metadata = { title: "পোস্ট সম্পাদনা" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function EditPostPage({ params, searchParams }: Props) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  return renderEditor(id, saved === "1");
}
