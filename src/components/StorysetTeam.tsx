import Image from 'next/image'

type Props = {
  className?: string
  priority?: boolean
  compact?: boolean
}

export function StorysetTeam({ className = '', priority = false, compact = false }: Props) {
  return (
    <figure className={`relative flex flex-col items-center ${className}`}>
      <div className={`storyset-float relative ${compact ? 'h-40 w-52' : 'h-52 w-72 sm:h-60 sm:w-80'}`}>
        <Image
          src="https://stories.freepiklabs.com/storage/26391/team-work-01.svg"
          alt="함께 블록을 쌓는 세 명의 팀원"
          fill
          priority={priority}
          unoptimized
          sizes={compact ? '208px' : '(max-width: 640px) 288px, 320px'}
          className="object-contain"
        />
      </div>
      <figcaption className="mt-1 text-[10px] tracking-[-0.01em] text-ink/35">
        <a
          href="https://storyset.com/people"
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-study hover:underline"
        >
          People illustrations by Storyset
        </a>
      </figcaption>
    </figure>
  )
}
