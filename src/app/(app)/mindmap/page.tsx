export default function MindmapPage() {
  return (
    <section className="page-enter">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-hairline pb-7">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-study">Knowledge map</p>
          <h1 className="font-display mt-3 text-3xl font-bold text-ink sm:text-4xl">스터디 마인드맵</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
            매일 23:50 정리본과 함께 분류된 학습 주제를 그래프로 탐색하는 화면입니다.
          </p>
        </div>
        <span className="rounded-full bg-mist px-3 py-1.5 font-mono text-[10px] font-semibold text-study">DATA MODEL NEXT</span>
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-hairline text-xs font-semibold text-ink/45">
        <span className="border-b-2 border-study px-4 py-3 text-study">Graph</span>
        <span className="px-4 py-3">List</span>
        <span className="px-4 py-3">Recent</span>
      </div>

      <div className="relative grid min-h-[560px] place-items-center overflow-hidden rounded-[24px] border border-hairline bg-[radial-gradient(circle_at_center,#f7fbf8_0%,#edf6f1_72%,#e8f2ec_100%)] px-6 text-center">
        <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(#74b892_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="absolute left-[14%] top-[24%] size-2 rounded-full bg-leaf shadow-[0_0_0_8px_rgba(116,184,146,0.13)]" />
        <div className="absolute right-[18%] top-[20%] size-3 rounded-full bg-study/70 shadow-[0_0_0_10px_rgba(47,125,90,0.1)]" />
        <div className="absolute bottom-[20%] left-[23%] size-2.5 rounded-full bg-study/50 shadow-[0_0_0_8px_rgba(47,125,90,0.08)]" />
        <div className="relative z-10 max-w-md">
          <div className="growth-ring relative mx-auto mb-9 grid size-24 place-items-center rounded-full bg-study text-sm font-bold text-white shadow-[0_16px_40px_rgba(47,125,90,0.2)]">
            Study Grove
          </div>
          <h2 className="font-display text-2xl font-bold text-ink">지식의 연결을 담을 화면 골격입니다</h2>
          <p className="mt-3 text-sm leading-6 text-ink/52">
            AI 주제 분류 데이터가 준비되면 주변 점들이 실제 주제 노드가 되고, 선택한 기록이 오른쪽 상세 영역에 열립니다.
          </p>
        </div>
      </div>
    </section>
  )
}
