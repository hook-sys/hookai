import AuthForm from "./AuthForm";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return <AuthForm initialMode="signin" />;
}
