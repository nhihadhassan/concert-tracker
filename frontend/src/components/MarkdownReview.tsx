import ReactMarkdown from 'react-markdown'

interface MarkdownReviewProps {
  markdown: string
}

export function MarkdownReview({ markdown }: MarkdownReviewProps) {
  return (
    <div className="album-review-prose">
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">{children}</a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
