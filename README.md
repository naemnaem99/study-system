# Study Grove

각자의 배움을 팀의 지식으로 키우는 4인 스터디 기록 공간.

4인 스터디 팀의 비공개 학습 기록 공간. 각자 공부한 내용을 올리고, 서로 읽고, 팀원별 저장소에 쌓인다.

- 설계: `docs/2026-08-05-team-study-hub-design.md`
- 1단계 계획: `docs/2026-08-05-study-hub-phase1-plan.md`

## 개발

```bash
npm install
cp .env.local.example .env.local   # 값을 채운다
npm run dev
```

## 테스트

```bash
npm test          # 단위 테스트 (날짜·입력 검증)
npm run test:rls  # 권한 테스트 — 실제 Supabase에 접속한다
```

권한 테스트에는 `.env.test.local` 이 필요하다. 팀원 4명 중 서로 다른 두 계정을 넣는다.

```
TEST_USER_A_EMAIL=
TEST_USER_A_PASSWORD=
TEST_USER_B_EMAIL=
TEST_USER_B_PASSWORD=
```

이 테스트가 검증하는 것은 "남의 노트를 건드릴 수 없다"는 것이다. **권한 결함은 에러를 내지 않고 조용히 존재하므로**, 정책을 손댔다면 반드시 다시 돌린다.

## 팀원 추가

1. Supabase → Authentication → Users → Add user (**Auto Confirm User 체크**)
2. 생성된 `User UID` 를 복사
3. SQL Editor에서 `profiles` 에 행 추가

```sql
insert into public.profiles (id, display_name, slug, sort_order)
values ('복사한-uuid', '이름', 'slug', 5);
```

`slug` 는 URL에 들어가므로 영문 소문자. `sort_order` 는 상단 내비게이션 표시 순서.

넣은 뒤 반드시 확인한다. UID를 잘못 넣으면 "로그인은 되는데 계속 권한 없음 화면으로 튕기는" 증상이 나오는데, 미등록 계정과 화면상 구분되지 않아 원인을 찾기 어렵다.

```sql
select p.sort_order, p.display_name, p.slug, u.email
from public.profiles p join auth.users u on u.id = p.id
order by p.sort_order;
```

**가입 페이지는 없다.** 계정은 대시보드에서만 만든다. Authentication 설정에서 `Enable Email provider` 는 켜고, `Allow new users to sign up` 은 끈 상태를 유지한다.

## 구조

```
src/lib/date.ts          KST 날짜 계산
src/lib/env.ts           환경변수 검증
src/lib/validation.ts    노트 입력 검증
src/lib/auth.ts          현재 사용자 프로필, 접근 게이트
src/lib/supabase/        브라우저·서버 클라이언트
src/middleware.ts        세션 갱신, 비로그인 차단
src/app/(app)/           로그인 + 팀원 등록이 필요한 영역
supabase/migrations/     스키마와 RLS 정책
```

권한은 화면이 아니라 **Postgres RLS가 강제한다.** 버튼을 숨기는 것에 의존하지 않는다.

## 다음 단계

- 2단계: 파일 첨부
- 3단계: 날짜별 AI 정리본
