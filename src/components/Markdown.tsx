import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ব্লগের Markdown লেখা দেখায়। react-markdown কাঁচা HTML চালায় না এবং javascript: লিংক বাদ দেয়,
// তাই পোস্টে কেউ ক্ষতিকর কোড বসাতে পারে না।
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-zinc max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-indigo-600 prose-img:rounded-xl dark:prose-a:text-indigo-400">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const external = href?.startsWith("http");
            return (
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {children}
              </a>
            );
          },
          // eslint-disable-next-line @next/next/no-img-element
          img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
