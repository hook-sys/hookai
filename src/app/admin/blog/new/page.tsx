import { renderEditor } from "../editorPage";

export const metadata = { title: "New post" };

export default async function NewPostPage() {
  return renderEditor(null, false);
}
