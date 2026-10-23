import { renderEditor } from "../editorPage";

export const metadata = { title: "নতুন পোস্ট" };

export default async function NewPostPage() {
  return renderEditor(null, false);
}
