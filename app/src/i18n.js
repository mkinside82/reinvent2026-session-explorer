// Translate application-owned copy only. Catalog values are interpolated unchanged.
export const LANGUAGE_KEY = 'reinvent-ui-language';
let language = 'ja';
export function resolveLanguage(saved, browserLanguage = 'ja') {
  return ['ja', 'en'].includes(saved)
    ? saved
    : String(browserLanguage).toLowerCase().startsWith('en')
      ? 'en'
      : 'ja';
}
export function initializeLanguage(storage, browserLanguage) {
  let saved;
  try {
    saved = storage?.getItem(LANGUAGE_KEY);
  } catch {}
  language = resolveLanguage(saved, browserLanguage);
  return language;
}
export const getLanguage = () => language;
export const getLocale = () => (language === 'en' ? 'en-US' : 'ja-JP');
export const planSummaryLabel = (items, days) =>
  language === 'en'
    ? `${items} planned item${items === 1 ? '' : 's'} · ${days} day${days === 1 ? '' : 's'}`
    : `${items}件の参加候補 · ${days}日間`;
export const awsScheduleSummaryLabel = ({ reservations, favorites, personalTimes, localPicks }) =>
  language === 'en'
    ? `AWS data loaded · ${reservations} reserved · ${favorites} favorites · ${personalTimes} personal times · ${localPicks} local picks`
    : `AWSから取得済み · 予約済み ${reservations}件 · お気に入り ${favorites}件 · 個人予定 ${personalTimes}件 · ローカル候補 ${localPicks}件`;
export function setLanguage(value, storage) {
  if (!['ja', 'en'].includes(value)) return false;
  language = value;
  try {
    storage?.setItem(LANGUAGE_KEY, value);
  } catch {}
  return true;
}
const english = Object.freeze({
  AWSの予定を再取得: 'Refresh AWS schedule',
  'AWSの予約・お気に入り・個人予定を読み込み、My Planに反映します。起動時にも自動取得します。ローカル候補はAWSへ送信しません。':
    'Reload reservations, favorites, and personal time from AWS into My Plan. This also happens automatically at startup. Local picks are not sent to AWS.',
  'AWS Scheduleから予約・お気に入り・個人予定を取得中です。':
    'Loading reservations, favorites, and personal time from AWS Schedule.',
  'AWSから予約・お気に入り・個人予定を取得できませんでした。表示中の情報は保持しています。':
    'Could not load reservations, favorites, and personal time from AWS. Keeping the currently displayed information.',
  'AWS Scheduleを更新できませんでした。表示中の情報は保持しています。':
    'Could not refresh AWS Schedule. Keeping the currently displayed information.',
  'AWS Scheduleを確認しています': 'Loading AWS Schedule',
  'セッション検索と他の操作はそのまま利用できます。':
    'Session search and other actions remain available.',
  'AWSの予約・お気に入り・個人予定はAWSから取得 · 候補はこのアカウントのブラウザーに保存 · 候補を外してもAWS予約は解除されません':
    'Reservations, favorites, and personal time load from AWS · local picks stay in this browser · removing a pick does not cancel an AWS reservation',
  '候補はこのブラウザーに保存 · AWS予約とは未同期':
    'Picks are stored in this browser · not synced with AWS reservations',
  '候補はこのブラウザーに保存 · サインイン後にアカウント別で引き継ぎ':
    'Picks are stored in this browser · carried into your account after sign-in',
  'AWS Events API · re:Invent 2026 · AWS予約をMy Planに同期。候補はアカウント別にローカル保存します。':
    'AWS Events API · re:Invent 2026 · AWS reservations sync to My Plan. Picks are stored locally by attendee account.',
  候補を外す: 'Remove pick',
  候補をすべて削除: 'Clear local picks',
  'My Planに表示中': 'in My Plan',
  '✓ ローカル候補を外す': '✓ Remove local pick',
  実際に手を動かして学ぶ: 'Learn by building hands-on',
  'AWS re:Invent 2026は2,200以上のセッションを掲載し、その70%をインタラクティブ形式と案内しています。講演を聞くだけでなく、WorkshopやBuilders’ sessionなど手を動かせる形式を優先しました。':
    'AWS says re:Invent 2026 features more than 2,200 sessions, with 70% in interactive formats. This prioritizes hands-on formats such as workshops and Builders’ sessions over talks alone.',
  'My Plan候補と重ならないセッションを優先しています。':
    'Sessions that do not overlap with your My Plan are prioritized.',
  'My Planの時間と重なりません': 'Does not overlap your My Plan',
  'My Planの予定と重なります': 'Overlaps your My Plan',
  '時間未定 · 空き時間は未確認': 'Time TBD · availability not checked',
  '予約を管理・解除': 'Manage / cancel reservations',
  予約を解除するセッションを選択: 'Select reservations to cancel',
  'AWS Scheduleの予約を最大10件選んで解除できます。My Planから外す操作とは別です。':
    'Select up to 10 reservations from your AWS Schedule to cancel. This does not remove items from My Plan.',
  カタログにないセッション: 'Session not in the current catalog',
  '選択した予約をAWSから1件ずつ解除します。この操作はMy Planの候補を削除しません。':
    'These reservations will be canceled from AWS one at a time. This does not remove My Plan items.',
  '解除後にAWS Scheduleを再読込し、セッションごとに結果を表示します。':
    'AWS Schedule will be reloaded after cancellation, with a result for each session.',
  選択した予約を解除: 'Cancel selected reservations',
  'AWS Scheduleを再読込し、解除結果を照合しました。':
    'AWS Schedule was reloaded to confirm cancellation results.',
  'AWS Scheduleを再読込できませんでした。解除結果を確認してください。':
    'AWS Schedule could not be reloaded. Check cancellation results.',
  '予約解除済み・AWS Scheduleで確認済み': 'Canceled and confirmed in AWS Schedule',
  '解除結果不明・Scheduleを確認してください': 'Outcome unknown; check AWS Schedule',
  予約を解除できませんでした: 'Could not cancel reservation',
  'AWS Scheduleに予約済みのセッションはありません。': 'No reserved sessions in AWS Schedule.',
  '予約・解除の受付時間外です。AWSの案内を確認してください。':
    'Reservations and cancellations are currently closed. Check AWS guidance.',
  'AWSへ予約解除を送信できませんでした。': 'Could not send the cancellation request to AWS.',
  CANCELLATION_FAILED: 'AWS did not accept the cancellation.',
  'My Planから外す操作とは別です。': 'This is separate from removing an item from My Plan.',
  選択してAWSへ予約: 'Select sessions to reserve on AWS',
  AWSへ予約するセッションを選択: 'Select sessions to reserve on AWS',
  'My Planから予約対象を選び、内容を確認してからまとめて送信します。':
    'Choose sessions from My Plan, review them, then send them together.',
  '予約対象を最大10件選んでください。My Plan内の時間重複を確認できますが、AWSが最終判定します。':
    'Select up to 10 sessions. My Plan shows local time overlaps; AWS makes the final decision.',
  選択内容を確認: 'Review selection',
  この内容でAWSへ送信: 'Send these to AWS',
  選択へ戻る: 'Back to selection',
  '次のセッションを1回のリクエストでAWSへ送信します。送信後の個別結果を表示します。':
    'These sessions will be sent in one request. Results will be shown for each session.',
  'AWSの予約成功はMy Planの候補選択とは別に管理されます。':
    'AWS reservation status is separate from My Plan selection.',
  'AWS Scheduleを再読込し、予約状態を照合しました。':
    'AWS Schedule was reloaded to confirm reservation status.',
  'AWS Scheduleを再読込できませんでした。結果を確定できない項目があります。':
    'AWS Schedule could not be reloaded. Some outcomes could not be confirmed.',
  '予約済み・AWS Scheduleで確認済み': 'Reserved and confirmed in AWS Schedule',
  '結果不明・AWS Scheduleで未確認': 'Outcome unknown; AWS Schedule did not confirm it',
  'AWS応答は成功・Schedule未確認': 'AWS accepted the request; Schedule not confirmed',
  予約できませんでした: 'Reservation failed',
  予約済み: 'Reserved',
  AWS状態未確認: 'AWS status not checked',
  'お気に入り・未予約': 'Favorite · not reserved',
  '候補・未予約': 'Plan pick · not reserved',
  ICSに出力する予定を選択: 'Choose items to export to ICS',
  'My Plan・AWS予約・AWSお気に入りから選択できます。Walk-up Onlyは予約対象外の当日参加枠です。My Planに追加して選択できます。':
    'Choose from My Plan, AWS reservations, and AWS favorites. Walk-up Only sessions are in-person and cannot be reserved; add them to My Plan, then select them here.',
  ICS出力対象: 'ICS export selection',
  AWS予約済みだけを選択: 'Select AWS reserved only',
  'Walk-up Onlyだけを選択': 'Select Walk-up Only',
  出力可能な予定をすべて選択: 'Select all exportable items',
  選択を解除: 'Clear selection',
  ICS出力候補を検索: 'Search ICS export candidates',
  セッション名・コードで検索: 'Search by session title or code',
  選択した予定を書き出す: 'Export selected items',
  'Walk-up Only（当日参加・予約対象外）': 'Walk-up Only (in-person, no reservation)',
  'Walk-up Onlyです。事前予約できず、現地で当日参加するセッションです。':
    'Walk-up Only: advance reservations are unavailable; attend in person on the day.',
  参加方法: 'Attendance type',
  'Walk-up Only（当日参加のみ）': 'Walk-up Only',
  '事前予約不可 · 当日会場で参加': 'No advance reservation · attend in person on the day',
  セッションコード: 'Session code',
  セッションコードをコピー: 'Copy session code',
  セッションコードをコピーしました: 'Copied session code',
  'コピーに失敗しました。ブラウザーの権限を確認してください。':
    'Could not copy. Check your browser permissions.',
  '、Walk-up Only・事前予約不可': ', Walk-up Only · no advance reservation',
  '事前予約なしで現地参加するセッションに絞り込みます。':
    'Show sessions that can only be attended in person without an advance reservation.',
  '日時未定 · ICS出力対象外': 'Time TBD · not exportable to ICS',
  '検索に一致する予定はありません。': 'No items match your search.',
  'AWS Scheduleに予約済み': 'Already reserved in AWS Schedule',
  'AWS Scheduleに予約済みのセッションがあります。Scheduleを更新してください。':
    'One or more sessions are already reserved. Refresh AWS Schedule.',
  予約可能: 'Reservable',
  'AWS API上で予約対象外': 'Not reservable by AWS',
  予約時間が他の予定と重複: 'Conflicts with another scheduled session',
  すでに予約済み: 'Already scheduled',
  満席: 'Session is full',
  予約権限がありません: 'Insufficient reservation access',
  セッション開始後: 'The session has already started',
  お気に入り登録済み: 'Already favorited',
  お気に入り登録されていません: 'Not favorited',
  AWSが予約を受け付けませんでした: 'AWS did not accept the reservation',
  競合: 'Conflicts',
  'My Plan内で時間重複': 'Overlaps another item in My Plan',
  '予約受付期間外か、AWS Scheduleが更新されています。Scheduleを更新して確認してください。':
    'Reservations may be closed or the AWS Schedule may have changed. Refresh Schedule and review again.',
  'AWS Scheduleを取得できませんでした。予約前に状態を確認してください。':
    'Could not load AWS Schedule. Check the current state before reserving.',
  '予約対象外のセッションが含まれています。AWSカタログを更新してください。':
    'A session is not reservable. Refresh the AWS catalog.',
  'AWSへ予約を送信できませんでした。': 'Could not send the reservation request to AWS.',
  'AWS側で一時的な上限に達しました。時間をおいてください。':
    'AWS rate limit reached. Please wait and retry.',
  '結果を確認できませんでした。再送せず、AWS Scheduleを確認してください。':
    'The outcome is unknown. Do not resend; check AWS Schedule first.',
  EVENT_REGISTRATION_REQUIRED: 'Registration for AWS re:Invent is required.',
  RESERVATIONS_CLOSED_OR_CONFLICT: 'Reservations are closed or AWS Schedule has changed.',
  SESSION_ALREADY_RESERVED: 'One or more sessions are already reserved. Refresh AWS Schedule.',
  SESSION_NOT_RESERVABLE: 'A session is not reservable. Refresh the AWS catalog.',
  RESERVATION_OUTCOME_UNKNOWN: 'The outcome is unknown. Check AWS Schedule before retrying.',
  AWSお気に入り: 'AWS favorites',
  AWSお気に入りに追加: 'Add to AWS favorites',
  AWSお気に入りから削除: 'Remove from AWS favorites',
  PlanのAWSセッションをお気に入りに追加: 'Favorite AWS sessions in My Plan',
  AWSお気に入りに追加するセッションを選択: 'Select sessions to add to AWS favorites',
  'My Planのセッションからお気に入り登録する対象を選んでください。':
    'Choose sessions from My Plan to add to AWS favorites.',
  'お気に入り対象を最大10件選んでください。': 'Select up to 10 sessions to favorite.',
  AWSお気に入り登録済み: 'Already in AWS favorites',
  お気に入りに追加予定: 'Will be added to favorites',
  'お気に入り結果不明 · AWS Scheduleを更新してください':
    'Favorite outcome unknown · Refresh AWS Schedule',
  '選択したセッションをAWSお気に入りに登録します。予約は行いません。':
    'These sessions will be added to AWS favorites. No reservations will be made.',
  登録対象を確認してください: 'Review the sessions to add.',
  この内容でAWSへ登録: 'Add these to AWS favorites',
  'お気に入り登録済み・Scheduleで確認済み': 'Favorited and confirmed in AWS Schedule',
  '登録結果不明・Scheduleで未確認': 'Outcome unknown; AWS Schedule did not confirm it',
  'AWS応答成功・Schedule未確認': 'AWS accepted the request; Schedule not confirmed',
  'AWS Scheduleでお気に入り登録を確認しました。': 'AWS Schedule confirms the favorites.',
  'AWS Scheduleを再読込できませんでした。結果を確認してください。':
    'Could not reload AWS Schedule. Check the result.',
  AWSがお気に入りを受け付けませんでした: 'AWS did not accept this favorite.',
  AWSお気に入り登録に失敗しました: 'Could not add to AWS favorites.',
  'AWSお気に入りを更新できませんでした。': 'Could not update AWS favorites.',
  AWSお気に入りに追加しました: 'Added to AWS favorites',
  AWSお気に入りから削除しました: 'Removed from AWS favorites',
  '結果を確認できません。再送せず、AWS Scheduleのお気に入りを確認してください。':
    'Outcome unknown. Do not retry; check AWS Schedule favorites first.',
  'AWS応答は成功しましたがScheduleで未確認です。更新して状態を確認してください。':
    'AWS accepted the request, but Schedule did not confirm it. Refresh and check the state.',
  PlanにAWSセッションがありません: 'No AWS sessions in My Plan',
  'AWSセッションをMy Planに追加してください。': 'Add AWS sessions to My Plan first.',
  'AWSがお気に入りの更新を受け付けていません。時間をおいてください。':
    'AWS is not accepting favorite changes right now. Try again later.',
  'AWS側でお気に入りにしたセッションが、Scheduleの更新後にここへ表示されます。':
    'Sessions you favorited on AWS appear here after Schedule refresh.',
  AWSお気に入りはありません: 'No AWS favorites',
  'AWS Scheduleから同期': 'Synced from AWS Schedule',
  'AWS Scheduleの個人予定です。編集・削除はAWS側へ反映します。':
    'This personal time is managed by AWS Schedule. Edits and deletion are sent to AWS.',
  'AWSが返したUTC時刻をLas Vegasの時刻に変換':
    'UTC time returned by AWS, converted to Las Vegas local time',
  AWS個人予定を追加: 'Add AWS personal time',
  AWS個人予定を編集: 'Edit AWS personal time',
  'AWS個人予定を削除しますか？': 'Delete this AWS personal-time entry?',
  '旅行・休憩などの予定をAWS Scheduleへ保存します。時刻は会場時間（Las Vegas）で入力します。':
    'Save travel, breaks, or other personal time to AWS Schedule. Enter times in Las Vegas local time.',
  タイトル: 'Title',
  説明: 'Description',
  '場所（任意）': 'Location (optional)',
  AWS予定を削除: 'Delete AWS entry',
  'AWS Scheduleへ保存': 'Save to AWS Schedule',
  削除する: 'Delete',
  '開始・終了時刻は会場時間で入力し、5分単位の正しい範囲を指定してください。':
    'Enter a valid time range in venue time, in 5-minute increments.',
  'AWS Scheduleで結果を確認できませんでした。再送せず、Scheduleを確認してください。':
    'Could not confirm the result in AWS Schedule. Do not retry; check Schedule first.',
  'AWS Scheduleで削除を確認できませんでした。再実行せず、Scheduleを確認してください。':
    'Could not confirm deletion in AWS Schedule. Do not retry; check Schedule first.',
  AWS個人予定を更新しました: 'AWS personal time updated',
  AWS個人予定を追加しました: 'AWS personal time added',
  AWS個人予定を削除しました: 'AWS personal time deleted',
  'AWS個人予定を保存できませんでした。': 'Could not save AWS personal time.',
  'AWS個人予定を削除できませんでした。': 'Could not delete AWS personal time.',
  'タイトル・説明・場所の長さを確認してください。':
    'Check the title, description, and location lengths.',
  '日付と時刻を確認してください。': 'Check the date and time.',
  '終了は開始より後の5分単位にしてください。':
    'End time must be after start in 5-minute increments.',
  'AWS個人予定の変更は現在受け付けられていません。':
    'AWS is not accepting personal-time changes right now.',
  'AWSが個人予定を受け付けませんでした。': 'AWS rejected the personal-time change.',
  編集: 'Edit',
  削除: 'Delete',
  セッション内容の翻訳: 'Translate session content',
  '日本語で読むには、詳細画面の「日本語訳」をお試しください。対応するデスクトップChromeではブラウザー内で翻訳します。利用できない場合はChromeやSafariのページ翻訳を使えます。原文は変更しません。':
    'Use “Japanese translation” in session details. Supported desktop versions of Chrome translate in the browser. If unavailable, use Chrome or Safari page translation. The original text is unchanged.',
  日本語訳: 'Translate to Japanese',
  再翻訳: 'Translate again',
  'Chromeの翻訳モデルを準備しています。初回はダウンロードに時間がかかることがあります。':
    'Preparing Chrome’s translation model. The first download may take a while.',
  '端末内翻訳を利用できません。Chromeのページ翻訳も使えます。':
    'On-device translation is unavailable. Chrome page translation is also an option.',
  Chromeの翻訳方法: 'Translation in Chrome',
  Safariの翻訳方法: 'Translation in Safari',
  セッションへ移動: 'Skip to sessions',
  're:Invent · 非公式プランナー': 're:Invent · Unofficial planner',
  メイン: 'Main navigation',
  モバイルメイン: 'Mobile navigation',
  データソース: 'Data source',
  更新: 'Refresh',
  'セッション・コード・登壇者・AWSサービス': 'Sessions, codes, speakers, AWS services',
  セッション検索: 'Search sessions',
  検索をクリア: 'Clear search',
  並び順: 'Sort order',
  Time順: 'By time',
  Title順: 'By title',
  一覧の表示形式: 'Results view',
  適用中のFilter: 'Applied filters',
  セッション一覧: 'Session list',
  'セッションを読み込んでいます…': 'Loading sessions…',
  読み込み中: 'Loading',
  ICSを書き出し: 'Export ICS',
  すべて削除: 'Clear all',
  'My Planの日付': 'My Plan date',
  'My Planの表示形式': 'My Plan view',
  今日: 'Today',
  Filterを閉じる: 'Close filters',
  '同じ項目内はOR、異なる項目間はANDで絞り込みます。':
    'Values within a field use OR; different fields use AND.',
  日時: 'Date and time',
  'Time · 会場現地時間': 'Time · Venue local time',
  この時間内に収まるセッションのみ: 'Only sessions that fit entirely within this time',
  '終了時刻は開始時刻より後にしてください。': 'End time must be after start time.',
  結果を見る: 'Show results',
  'My Planをすべて削除しますか？': 'Clear all of My Plan?',
  'ローカル候補をすべて削除しますか？': 'Clear all local picks?',
  'このブラウザーに保存した候補が削除されます。': 'Removes planned items saved in this browser.',
  'ブラウザーに保存した手動候補だけを削除します。AWS予約は残ります。':
    'Removes only local picks saved in this browser. AWS reservations remain.',
  キャンセル: 'Cancel',
  閉じる: 'Close',
  保存: 'Save',
  'JavaScriptを有効にしてください。': 'Please enable JavaScript.',
  'セッションを検索・比較し、Day Plannerで参加候補と空き時間を整理するre:Invent 2026のプレビュー用プランナー。':
    'A re:Invent 2026 preview planner for searching and comparing sessions, and organizing planned items and free time in Day Planner.',
  レベル未設定: 'Unspecified level',
  以上を解除: ' and above: remove filter',
  以上: ' and above',
  を解除: ' — remove filter',
  時間の条件を解除: 'Remove time filter',
  枠内: 'Within time',
  '件を比較対象に選択 · ': ' items selected for comparison · ',
  解除: 'Clear selection',
  取得できませんでした: 'Could not load',
  サインインが必要です: 'Sign-in required',
  掲載中のサイドイベントはありません: 'No side events listed',
  '出典を確認できたイベントを追加します。': 'Events are added when their source can be checked.',
  一致するイベントがありません: 'No matching events',
  'キーワードやFilterを少し減らしてお試しください。': 'Try fewer keywords or filters.',
  検索とFilterをクリア: 'Clear search and filters',
  'さらに40件を表示（残り': 'Show 40 more (remaining: ',
  'AWS Builder IDでサインインしてください': 'Sign in with AWS Builder ID',
  'AWSの実カタログを読むには、イベント登録済みのアカウントが必要です。':
    'An event-registered account is required to read the AWS catalog.',
  セッションを取得できませんでした: 'Could not load sessions',
  '通信状態を確認して、もう一度お試しください。': 'Check your connection and try again.',
  再試行: 'Retry',
  AWSカタログを取得しています: 'Loading the AWS catalog',
  セッションデータがまだありません: 'No session data yet',
  '最初のページを受信すると、続きの取得中も結果を表示します。':
    'Results appear as soon as the first page arrives while remaining pages load.',
  'データが公開されると、ここに表示されます。': 'Sessions will appear here when published.',
  再読み込み: 'Reload',
  一致するセッションがありません: 'No matching sessions',
  すべての日付: 'All dates',
  日付未定: 'Date TBD',
  時間未定: 'Time TBD',
  会場未定: 'Venue TBD',
  '件の参加候補 · ': ' planned items · ',
  日間: ' days',
  件の予定で重複: ' overlapping items',
  'Compareで内容を比べて選択できます。': 'Use Compare to review and choose sessions.',
  'My Planはまだ空です': 'My Plan is empty',
  '気になるセッションを追加して、1日の予定を組み立てましょう。':
    'Add interesting sessions to build your day.',
  セッションを探す: 'Find sessions',
  候補を読み込んでいます: 'Loading planned items',
  '保存済みのMy Planを確認しています。': 'Checking saved My Plan items.',
  保存した候補を表示できません: 'Could not display saved items',
  '候補のIDは保持しています。セッションを再取得してください。':
    'Saved item IDs are retained. Reload sessions to try again.',
  この日の候補はありません: 'No planned items on this day',
  '日付を切り替えるか、セッションを追加してください。': 'Choose another date or add a session.',
  Timelineの日付を選んでください: 'Choose a date for Timeline',
  '1日ずつ選ぶと、予定と空き時間を確認できます。':
    'Choose one day to see planned items and free time.',
  現在のデータにない候補が: 'Items absent from the current catalog: ',
  '件あります。': ' items.',
  'AWS Events API · re:Invent 2026 · My Planはこのアカウント用のローカル候補で、AWS Scheduleとは別です。':
    'AWS Events API · re:Invent 2026 · My Plan stores local candidates for this account, separately from AWS Schedule.',
  'AWS接続用サーバーに接続できません。アプリを再起動してください。':
    'The AWS-connected server is unavailable. Restart the app and try again.',
  プレビュー: 'Preview',
  AWS接続: 'AWS connected',
  'プレビュー（サンプルデータ） · 予約・空席情報はサンプルです。My Planへの追加は予約ではありません。':
    'Preview (sample data) · Reservation and availability information is sample data. Adding to My Plan does not reserve a seat.',
  'AWSのtimezoneがある場合はLas Vegasへ変換し、欠落時はAPI記載の時刻をそのまま表示します。':
    'AWS times with a timezone are converted to Las Vegas time. Without a timezone, times are displayed as supplied by the API.',
  '時刻：会場現地時間（Las Vegas）': 'Time: venue local time (Las Vegas)',
  'AWS catalog取得中 · ': 'Loading AWS catalog · ',
  ページ受信: ' pages received',
  'ページを取得 · 更新 ': ' pages loaded · Updated ',
  '最新取得に失敗しました（': 'Latest refresh failed (',
  '）。表示中のcacheは保持しています。': '). The displayed cache is retained.',
  '未完了のcache · ': 'Incomplete cache · ',
  'ページ取得済み · 続きの取得を再試行できます。':
    ' pages loaded · You can retry loading the remaining pages.',
  時刻不明: 'Time unknown',
  'このアカウントのLocal Plan · AWS Scheduleとは別':
    'Local Plan for this account · Separate from AWS Schedule',
  'このブラウザーに保存 · AWSとは未同期': 'Saved in this browser · Not synchronized with AWS',
  'サインイン後にアカウント別のLocal Planへ保存できます。':
    'Sign in to save a separate Local Plan for your account.',
  'My Planに追加しました（予約ではありません）': 'Added to My Plan (no seat reservation)',
  'My Planから削除しました': 'Removed from My Plan',
  比較は同時に3件までです: 'Compare up to 3 items at a time',
  空き時間の枠内に収まるセッションを表示しています:
    'Showing sessions that fit within this free time',
  '先頭100件を表示。検索して絞り込んでください。':
    'Showing the first 100 values. Search to narrow them down.',
  '該当する値はありません。': 'No matching values.',
  の候補を検索: ' values: search',
  を検索: ' search',
  'サインインを開始できませんでした。Local serverの状態を確認してください。':
    'Could not start sign-in. Check the local server.',
  'AWSからサインアウトできませんでした。KeychainとLocal serverの状態を確認してください。':
    'Could not sign out of AWS. Check Keychain and the local server.',
  'Builder IDを切り替え': 'Switch Builder ID',
  'Builder IDの切り替え': 'Switch Builder ID',
  'サインアウト方法を選んでください。': 'Choose how to sign out.',
  アプリだけからサインアウト: 'Sign out of this app only',
  'このアプリのAWSトークンとKeychain保存を消します。Builder IDのブラウザーセッションは残るため、再サインイン時に同じIDが自動で使われる場合があります。':
    'Remove this app’s AWS tokens and Keychain entry. Your Builder ID browser session stays active, so signing in again may use the same ID automatically.',
  'Builder IDもサインアウト': 'Also sign out of Builder ID',
  'アプリの認証情報を消した後、このブラウザーのBuilder IDセッションも終了します。戻った後に別のBuilder IDでサインインできます。':
    'After clearing this app’s credentials, end the Builder ID session in this browser too. You can sign in with a different Builder ID when you return.',
  アプリからサインアウト: 'Sign out of this app',
  'Builder IDを切り替える': 'Switch Builder ID',
  'このアプリからサインアウトしました。Builder IDのブラウザーセッションは維持しています。':
    'Signed out of this app. The Builder ID browser session remains active.',
  'AWSへサインインしてください。': 'Sign in to AWS.',
  'AWSカタログを更新できませんでした。': 'Could not refresh the AWS catalog.',
  一度に同期できる予定は50件までです: 'Sync up to 50 events at a time',
  '日時が確定した候補がないため、ICSを書き出せません。':
    'Cannot export ICS without items that have confirmed times.',
  件を書き出しました: ' items exported',
  ' · 日時未定の': ' · ',
  件は対象外です: ' items with unknown times were skipped',
  出典: 'Source',
  掲載元: 'listing source',
  'Conference Parties一覧': 'Conference Parties listing',
  出典一覧に掲載された時刻: 'Time listed by Conference Parties',
  主催者ページに掲載された時刻: 'Time listed on the organizer page',
  暫定時刻: 'Tentative time',
  時刻未確認: 'Time unverified',
  出典確認日: 'Source checked',
  時刻情報: 'Time details',
  タイムゾーン未定: 'Time zone not specified',
  主催: 'Host',
  受付状況: 'Status',
  満席として掲載されています: 'Listed as at capacity',
  申込: 'Registration',
  サイドイベント: 'Side event',
  コミュニティイベント: 'Community event',
  前日: 'previous day ',
  翌: 'next day ',
  'My Planをすべて削除しました': 'My Plan cleared',
  'AWS Local serverで開くと実データを使えます':
    'AWS data is available when opened through the local server',
  '保存済みのMy Planを読み込めませんでした。この画面では新しく候補を整理できます。':
    'Could not read saved My Plan. You can organize new items in this view.',
  'ブラウザーに保存できませんでした。候補はこの画面を開いている間だけ保持されます。':
    'Could not save in this browser. Items are retained only while this view stays open.',
  ' と重複': ' overlaps',
  'をMy Planから削除': ' — remove from My Plan',
  'をMy Planから外す': ' — remove from My Plan',
  'をMy Planに追加': ' — add to My Plan',
  '✓ Planned · 外す': '✓ Planned · Remove',
  'My Planから外す': 'Remove from My Plan',
  'My Planに追加': 'Add to My Plan',
  申込ページ: 'Registration page',
  申込不要と掲載されています: 'Listed as no registration required',
  申込条件は主催者に確認: 'Check registration requirements with the organizer',
  公式ページで要確認: 'Check the official page',
  ' · 時刻未確認': ' · Time unverified',
  ' · 申込が必要': ' · Registration required',
  ' · 申込不要': ' · No registration required',
  ' · 要確認': ' · Check required',
  Type未定: 'Type TBD',
  Track未定: 'Track TBD',
  Topic未定: 'Topic TBD',
  '概要はまだ公開されていません。': 'Abstract not published yet.',
  会場: 'Venue',
  場所: 'Location',
  カテゴリ: 'Category',
  登壇者: 'Speakers',
  登壇者未定: 'Speakers TBD',
  '時間未確認 · 出典確認日 ': 'Time unverified · Source checked ',
  '✓ 比較対象': '✓ Comparing',
  比較に追加: 'Add to compare',
  '日時未定のため、重複を確認できません。': 'Cannot check conflicts without confirmed times.',
  '、': ', ',
  を: ' — ',
  '（': ' (',
  '）': ')',
  件: ' items',
  から: ' to ',
  の空き時間でセッションを探す: ' — find sessions in this free time',
  ' · 09:00–18:00を基本に表示': ' · Default range 09:00–18:00',
  'タップで詳細 · 重複は横並び': 'Tap for details · Overlapping items appear side by side',
  空き時間: 'Free time',
  '表示時間内に空きはありません。': 'No free time in the displayed range.',
  '移動時間は含みません。会場間の移動も考慮してください。':
    'Travel time is excluded. Allow time to move between venues.',
  'この日の候補を整理（': 'Manage this day’s items (',
  '件）': ' items)',
  '日時未定 · Timeline対象外': 'Time TBD · Excluded from Timeline',
  '予約可否はAPIから提供されていません。': 'Reservability is not provided by the API.',
  'AWS API上は予約対象です。ここでは予約しません。':
    'The AWS API marks this session as reservable. Reservations are not made here.',
  'AWS API上は予約対象外です。': 'The AWS API marks this session as not reservable.',
  'サイドイベント情報です。AWSセッションの予約対象ではありません。':
    'This is a side event listing, not an AWS session reservation.',
  公式情報: 'Official source',
  AWS公式カタログで開く: 'Open AWS official catalog',
  'AWS公式カタログでセッションコードを検索してください。':
    'Search for the session code in the AWS official catalog.',
  '空席・予約状態はサンプルデータです。': 'Availability and reservation states are sample data.',
  '会場現地時間（Las Vegas）': 'Venue local time (Las Vegas)',
  'AWS時刻をそのまま表示 · timezone ': 'AWS times displayed as supplied · Timezone ',
  を変換できませんでした: ' could not be converted',
  'AWS記載の現地時刻 · timezone未提供': 'AWS local time as supplied · No timezone provided',
  コード未定: 'Code TBD',
  'Session Detailを閉じる': 'Close session details',
  未指定: 'Not specified',
  未定: 'TBD',
  不明: 'Unknown',
  '比較対象に追加 / 解除': 'Toggle comparison',
  ' My Planへの追加は予約ではありません。': ' Adding to My Plan does not reserve a seat.',
  比較を閉じる: 'Close comparison',
  '2件以上のセッションを選んでください': 'Select at least 2 sessions',
  '一覧の「比較に追加」で最大3件を選べます。': 'Use “Add to compare” to select up to 3 sessions.',
  概要未定: 'Abstract TBD',
  '件を比較 · 追加は予約ではありません。': ' items compared · Adding does not reserve a seat.',
  'モバイルでは横にスクロールして比較できます。': 'Scroll horizontally to compare on mobile.',
  項目: 'Field',
  状態: 'Status',
  今の注目テーマ: 'Current themes',
  おすすめ: 'Recommendations',
  最長有効期限: 'Latest expiry',
  候補から削除: 'Remove from Plan',
  '根拠 · 確認日 ': 'Evidence · Checked ',
  '根拠を確認したテーマを表示しています。': 'These themes are based on checked sources.',
  興味のある分野を選んでおすすめを調整: 'Choose interests to tune recommendations',
  '選択した分野に合うセッションを優先表示します。選択はこのブラウザーに保存します。':
    'Prioritize sessions matching your interests. Your choices are saved in this browser.',
  'AI / ML': 'AI / ML',
  'Generative AI': 'Generative AI',
  Architecture: 'Architecture',
  Serverless: 'Serverless',
  Containers: 'Containers',
  Security: 'Security',
  Database: 'Database',
  SaaS: 'SaaS',
  'Developer Tools': 'Developer Tools',
  あなたの関心分野から: 'Based on your interests',
  '未追加の候補を、選んだ関心分野とMy Planの空き時間に合わせて並べています。':
    'Unplanned sessions matching your interests are ranked with your My Plan availability.',
  AIエージェントを本番運用する: 'Run AI agents in production',
  'AWS re:Invent 2026の公式キュレーションで、エージェントの安全性・信頼性と本番化が取り上げられています。設計だけでなく、評価・権限・運用まで扱うセッションを優先しました。':
    'Official AWS re:Invent 2026 curated agendas highlight agent safety, reliability, and production readiness. These sessions cover evaluation, permissions, and operations alongside design.',
  エージェントの権限と安全性を設計する: 'Design agent permissions and safety',
  'AWS公式の今年のSecurity Focusはagentic securityを含み、ガバナンス・ID・認可・安全策を扱うと案内しています。AIを作るだけでなく、制御方法を学べる候補です。':
    'This year’s official AWS Security Focus includes agentic security, governance, identity, authorization, and safeguards. These sessions explore how to control AI systems.',
  'AWS公式ブログ · 最終更新': 'AWS official blogs · Updated',
  AWS公式ブログを確認中: 'Checking AWS official blogs',
  AWS公式記事を取得できていません: 'AWS official articles are unavailable',
  ' · 更新中': ' · Refreshing',
  ' · 更新失敗。前回の取得内容を表示中': ' · Refresh failed; showing the previous snapshot',
  'AWS公式記事 · 公開日': 'AWS article · Published',
  '根拠 · 確認日': 'Evidence · Checked',
});
const japaneseLabels = Object.freeze({
  Explore: '探す',
  'Day Planner': '一日の予定',
  Sessions: 'セッション',
  'Side events': 'サイドイベント',
  sessions: '件のセッション',
  'side events': '件のサイドイベント',
  Card: 'カード',
  Compact: 'コンパクト',
  List: '一覧',
  Timeline: '時間軸',
  Filter: '絞り込み',
  'UI language': '表示言語',
  Today: '今日',
  Tomorrow: '明日',
  'Clear all': 'すべて解除',
  Compare: '比較',
  'Schedule Conflict': '時間の重複',
  'Conflict · Compare': '時間重複 · 比較',
  '+ Add to Plan': '+ My Planに追加',
  Date: '日付',
  Time: '時間',
  'Title / Venue': 'タイトル / 会場',
  'Type / Level': '種別 / レベル',
  Plan: '候補',
  Source: '出典',
  Verified: '確認日',
  Timing: '日時の確度',
  Registration: '申込',
  'SESSION DETAIL': 'セッション詳細',
  Speakers: '登壇者',
  'Date / Time': '日付 / 時間',
  'Venue / Room': '会場 / 部屋',
  'Level / Type': 'レベル / 種別',
  Track: 'トラック',
  Topics: 'トピック',
  Services: 'サービス',
  'Roles / Industries': '対象者 / 業種',
  Keywords: 'キーワード',
  Reservable: '予約対象',
  'Session Compare': 'セッション比較',
  'DECIDE YOUR SESSION': '参加するセッションを選ぶ',
  Abstract: '概要',
  Speaker: '登壇者',
  'Track / Topic': 'トラック / トピック',
  Service: 'サービス',
  Venue: '会場',
  'Session Type': 'セッション種別',
  Level: 'レベル',
  Topic: 'トピック',
  'Advanced Filter': '詳細な絞り込み',
  Start: '開始',
  End: '終了',
  'Find sessions for this time': 'この空き時間のセッションを探す',
  'Explore category': '探索対象',
  'Quick Filter': 'クイック絞り込み',
  'WHY NOW': '今、注目する理由',
  EXPLORE: 'セッションを探す',
});
const stateLabels = Object.freeze({
  'Not planned': '候補外',
  Planned: '候補に追加済み',
  Available: '空席あり',
  Limited: '空席少なめ',
  'Very limited': '残りわずか',
  'Walk-up': 'Walk-up Only',
  Reserved: '予約済み',
  Favorite: 'AWSお気に入り',
  'Personal time': '個人予定',
  Full: '満席',
  Waitlist: 'キャンセル待ち',
  Conflict: '時間重複',
});
export const stateLabel = (value) =>
  language === 'ja' ? stateLabels[value] || value : value === 'Walk-up' ? 'Walk-up Only' : value;
const replacements = Object.entries(english).sort((a, b) => b[0].length - a[0].length);
// Template fragments contain application copy and markup; interpolated source
// values are never processed by the translator.
export function t(value) {
  const source = String(value ?? '');
  if (language === 'ja')
    return japaneseLabels[source.trim()]
      ? source.replace(source.trim(), japaneseLabels[source.trim()])
      : source;
  if (Object.hasOwn(english, source)) return english[source];
  let result = source;
  for (const [ja, en] of replacements) if (result.includes(ja)) result = result.split(ja).join(en);
  return result;
}
export function ui(strings, ...values) {
  return strings.reduce((result, part, index) => {
    const translated = t(part).replace(/>([^<>]*)(?=<|$)/g, (_match, text) => '>' + t(text));
    return result + translated + (index < values.length ? values[index] : '');
  }, '');
}
export function staticLanguageBindings(doc) {
  if (!doc.createTreeWalker) return () => {};
  const bindings = [];
  const walker = doc.createTreeWalker(doc.body, 4);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script,style,#languageSwitch')) continue;
    if (node.nodeValue.trim()) bindings.push([node, 'nodeValue', node.nodeValue]);
  }
  for (const element of doc.querySelectorAll('[aria-label],[placeholder],meta[name="description"]'))
    for (const name of ['aria-label', 'placeholder', 'content'])
      if (element.hasAttribute(name)) bindings.push([element, name, element.getAttribute(name)]);
  return () => {
    doc.documentElement.lang = language;
    for (const [element, name, original] of bindings) {
      if (name === 'nodeValue') element.nodeValue = t(original);
      else element.setAttribute(name, t(original));
    }
  };
}
