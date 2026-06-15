import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  BookOpen, 
  ClipboardList, 
  LayoutDashboard, 
  History, 
  Settings as SettingsIcon, 
  HelpCircle,
  Clock, 
  CheckCircle2, 
  UserCheck, 
  FileSpreadsheet, 
  ShieldAlert,
  Calendar,
  Globe,
  CheckSquare
} from 'lucide-react';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GuideTab = 'INTRO' | 'TODO' | 'MANAGER' | 'APPROVE_TASK' | 'DASHBOARD' | 'SETTINGS_LOGS';
type Language = 'en' | 'vi' | 'ja';

export default function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
  const [activeTab, setActiveTab] = useState<GuideTab>('INTRO');
  const [lang, setLang] = useState<Language>('en'); // Default is English as requested

  // Multi-lingual translation mapping dictionary matching actual codebase logic
  const t = {
    modalTitle: {
      en: "DymTask Companion & Technical Tutorial",
      vi: "Cẩm Nang & Hướng Dẫn Sử Dụng DymTask",
      ja: "DymTask 取扱説明書 & プラットフォーム解説"
    },
    modalSub: {
      en: "Work Synchronization & Administrative Services Outsourcing Pipeline",
      vi: "Hệ thống đồng bộ công việc & dịch vụ hành chính (事務代行)",
      ja: "業務同期 ＆ バックオフィス事務代行アウトソーシング運営システム"
    },
    footerAck: {
      en: "Acknowledge & Return to Dashboard",
      vi: "Đồng Ý / Trở Lại Làm Việc",
      ja: "承諾して実務ダッシュボードへ戻る"
    },
    companyTag: {
      en: "DymTask © 2026 Admin Outsourcing",
      vi: "DymTask © 2026 事務代行",
      ja: "DymTask © 2026 バックオフィス事務代行"
    },
    tabs: {
      INTRO: { en: "General Overview", vi: "Giới Thiệu Chung", ja: "システム概要" },
      TODO: { en: "To-do List", vi: "To-do List", ja: "ToDoリスト" },
      MANAGER: { en: "Task Creator", vi: "Task Manager", ja: "タスク制作" },
      APPROVE_TASK: { en: "Approve Task", vi: "Approve Task", ja: "タスク承認" },
      DASHBOARD: { en: "Dashboard", vi: "Dashboard", ja: "ダッシュボード" },
      SETTINGS_LOGS: { en: "Settings & Logs", vi: "Cài Đặt & Logs", ja: "システムマスター＆ログ" }
    },
    intro: {
      welcome: {
        en: "Welcome to DymTask!",
        vi: "Chào mừng bạn đến với DymTask!",
        ja: "DymTask（ディムタスク）プラットフォームへようこそ！"
      },
      desc: {
        en: "DymTask is a specialized SaaS infrastructure engineered to self-standardize operational data, set recurring timeline schedules, and trace performance across Administrative Outsourcing (事務代行) and business processes. The platform automatically aggregates, virtualizes, and projects checkpoints into manageable daily, weekly, or monthly lists. This ensures team members never skip critical milestones and repeatedly deliver flawless accuracy.",
        vi: "DymTask là hệ thống chuyên biệt dùng để chuẩn hóa dữ liệu, lên lịch công việc định kỳ và theo dõi kết quả vận hành dịch vụ hành chính (事務代ig Outsourcing) và nghiệp vụ doanh nghiệp. Hệ thống được phát triển nhằm tự động hóa danh sách việc cần thực hiện theo ngày, theo tuần hoặc theo tháng, giúp nhân viên không bỏ sót nghiệp vụ và nâng cao độ chính xác trong công việc.",
        ja: "DymTaskは、バックオフィス事務代行（事務代行/Outsourcing）や企業内各種業務プロセスを標準化し、反復タスクのスケジュール管理、および運行品質を追跡するための専門的なシステムです。日次、週次、月次のToDoリストをカレンダーに即して自動起票することで、日々の業務の抜け漏れを防ぎ、業務精度と成果を確実に保護します。"
      },
      flowTitle: {
        en: "The Dynamic Workflow Loop",
        vi: "Cách thức hoạt động cốt lõi của hệ thống",
        ja: "システム循環の基本３ステップ"
      },
      flows: [
        {
          step: { en: "Step 1", vi: "Bước 1", ja: "ステップ 1" },
          title: { en: "Task Templates Definition Rules", vi: "Task Manager (Mẫu Công Việc)", ja: "タスクマネージャー（業務ひな形）" },
          text: {
            en: "Administrators detail a robust Task Template associated with a specific Project & Team. Here, they formulate recurring frequency schemas (Daily, Weekly, Monthly, or One-time), define checkable Subtask units, and apply target duration constraints (Est. time).",
            vi: "Cấp quản lý định nghĩa một mẫu công việc thuộc Dự án, Nhóm, với tần suất cụ thể (Hàng ngày, Hàng tuần, Hàng tháng hoặc Phát sinh 1 lần) cùng các đầu mục nhỏ (Subtasks) và thời hạn hoàn thành.",
            ja: "管理者が特定のプロジェクトやチームに関連する「タスクテンプレート」を設定します。反復周期を設定（毎日、特定曜日、毎月特定日、または任意の単発）し、成果物の目印となるサブタスクと計画目安工数（Est. time）を入力します。"
          }
        },
        {
          step: { en: "Step 2", vi: "Bước 2", ja: "ステップ 2" },
          title: { en: "To-do List Operational Checklists", vi: "To-do List (Danh Sách Việc)", ja: "ToDoリスト（実稼働チェックシート）" },
          text: {
            en: "The backend framework synthesizes the templates onto a dynamic daily task timeline. Staff use search presets to filter down to their allocated items, update precise actual elapsed time, and tick off completed subtasks.",
            vi: "Hệ thống tự động đồng hóa và phân phối các việc này ra từng ngày cụ thể trên thời gian biểu. Nhân viên lọc theo tên mình, cập nhật số phút thực tế và tick hoàn thành đầu mục (Subtasks).",
            ja: "システムは保存されたテンプレートを展開し、カレンダー上の各稼働日に動的にタスクを起票します。現場オペレーターは自分の名前でフィルタリングし、実作業の経過実績時間（Actual time）を記録しながら各小項目を完了にチェックします。"
          }
        },
        {
          step: { en: "Step 3", vi: "Bước 3", ja: "ステップ 3" },
          title: { en: "Dashboard (Performance Analytics)", vi: "Dashboard (Biểu Đồ Hiệu Suất)", ja: "ダッシュボード（稼働成果分析）" },
          text: {
            en: "The analytical widget aggregates expected planning figures (Est. time) vs. actual minutes recorded (Actual time). This outputs real-time accuracy percentages and yields a sequential Roadmap representing overall team allocation.",
            vi: "Bộ máy biểu đồ phân tích thời gian ước tính (Est. time) so với thực tế thực hiện (Actual time), tính toán tỷ lệ hoàn thành công việc và cung cấp Lịch trình Weekly Roadmap tuần tự.",
            ja: "分析ダッシュボードが、計画見積時間とメンバーが申告した実稼働工数実績値をリアルタイムで自動集計。業務完了率、対応のばらつき、週間タスクの混雑状況マップを立体的にビジュアル化します。"
          }
        }
      ],
      roleTitle: {
        en: "Chronological Access Identity Constraints",
        vi: "Bảng Phân Quyền Hạn Tài Khoản Hệ Thống (Roles)",
        ja: "アカウント各種システム役割権限マトリックス（ロール）"
      },
      roles: [
        {
          label: { en: "Master Account", vi: "Master Account", ja: "マスターアカウント" },
          color: "bg-rose-500/10 text-rose-600 border border-rose-500/20",
          text: {
            en: "Superuser level with complete capability access. Empowered to modify, create, or permanently purge task templates, construct/delete profiles (Users), manipulate master Project schemas, Teams, and Tags, with oversight across comprehensive system audit logs.",
            vi: "Tài khoản tối cao có đầy đủ quyền thao tác. Có quyền chỉnh sửa, thêm mới, xóa vĩnh viễn các mẫu công việc, quản lý toàn diện nhân sự (Users), các danh mục Dự án, Nhóm và Tag. Xem toàn bộ logs hệ thống.",
            ja: "システム全体の最上位管理者。全画面・全操作権限を保有します。各種マスタの変更/追加、物理削除、ユーザーアカウント全体の増減やセキュリティ設定、システム全体の軌跡ログの閲覧が可能です。"
          }
        },
        {
          label: { en: "Admin Account", vi: "Admin Account", ja: "管理者アカウント" },
          color: "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20",
          text: {
            en: "Production Managers. Authorized to launch, clone, and update task templates. View staff roster and configure Projects/Teams/Tags. Restricted from deleting user accounts or carrying out permanent manual task deletion.",
            vi: "Cấp quản lý trực tiếp. Có quyền tạo mới, sao chép nhanh, chỉnh sửa các mẫu công việc. Được phép xem danh sách nhân viên, thêm Dự án/Nhóm/Tag nhưng bị hạn chế chỉnh sửa/xóa tài khoản nhân sự và không thể xóa vĩnh viễn mẫu công việc.",
            ja: "日々の業務の責任管理者。通常業務で発生する定期タスクテンプレートの追加/再構築、複製コピー（Clone機能）を行うことができます。管理者権限として、一部のメンバーの参照やタグ設定の追加作成は可能ですが、他の管理者の変更削除は制限されます。"
          }
        },
        {
          label: { en: "User Account", vi: "User Account", ja: "一般オペレーター" },
          color: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
          text: {
            en: "Execution staff. Access is tailored purely to daily To-do items, monitoring personal Weekly Roadmaps to streamline upcoming tasks, and viewing personal interaction logs. Master database schemas and system configurations are hidden.",
            vi: "Nhân viên thực hiện chính. Giao diện trực quan thuần túy chỉ tập trung xử lý To-do List cá nhân, xem Roadmap tuần để lên lịch và xem Logs tương tác cá nhân. Không thể can thiệp vào cấu trúc danh mục hay cài đặt hệ thống.",
            ja: "実務作業を担当する現場スタッフ。自分の担当タスクToDoカレンダーにアクセスし、時間記録入力、週間進捗予定の確認等に完全に特化したビューです。システム共通管理メニューやセキュリティ定義などは安全のため非表示になります。"
          }
        }
      ]
    },
    todo: {
      title: {
        en: "To-do List Module (Individual Workspace)",
        vi: "Menu To-do List (Danh sách việc cần làm)",
        ja: "ToDoリストメニュー（業務処理ワークスペース）"
      },
      desc: {
        en: "The daily tactical station for all departments. Unlike static lists, the platform dynamically computes and populates recurring operational pipelines on customized date matrices.",
        vi: "Đây là màn hình hoạt động chính của mọi vị trí nhân viên hằng ngày. Thay vì hiển thị một danh sách tĩnh, hệ thống sẽ tự động dịch chuyển, ảo hóa và phân bổ công việc định kỳ ra từng ngày tùy chính trên thanh lịch biểu.",
        ja: "全スタッフが毎日使用するメインページです。固定化された一覧表とは異なり、各日付毎にサイクル条件に合致する必要な業務だけを、計画的に自動配置・展開する画期的なアプローチを採用しています。"
      },
      subTitle: {
        en: "Vital Tactical Tools & Operations Actions:",
        vi: "Các tính năng thao tác và kiểm soát quan trọng:",
        ja: "業務実運行上のアドバンテージ機能と操作方法："
      },
      cards: [
        {
          title: { en: "Datepicker Range Selection", vi: "Chọn ngày làm việc (Date Picker)", ja: "日付条件・一瞬切替（Date Picker）" },
          text: {
            en: "The system defaults to today's active tasks. You can quickly navigate back or look ahead in the date range input to preview upcoming task streams and secure files in advance.",
            vi: "Mặc định hệ thống luôn hiển thị công việc cần làm của ngày hôm nay. Bạn có thể mở rộng khoảng ngày để xem trước công việc trong tuần hoặc tuần sau, chuẩn bị dữ liệu cực kỳ chủ động.",
            ja: "基本カレンダー設定は常に本日のリストになりますが、期間バウンダリー表示を広げることで、一週間先の担当ToDo計画を先んじて把握し、ドキュメント類の整理や準備作業を行えます。"
          }
        },
        {
          title: { en: "Subtasks & Actual Minutes Tracking", vi: "Chi tiết công việc & Biên tập Subtasks (Side Drawer)", ja: "サブタスクの消化＆経過実績の編集" },
          text: {
            en: "Clicking any line launches the Context Slider. Here, monitor exact subtask lines matched with responsible personnel. When resolving tasks, update real-time Actual time minutes and tick checkmarks. The parent task automatically aggregates metrics.",
            vi: "Nhấp chọn bất kỳ việc nào để mở Panel Trượt bên phải. Có các đầu việc nhỏ (Subtasks) với người chịu trách nhiệm và số phút dự trù. Khi làm xong, nhân viên cập nhật Số phút thực tế (Actual time) và tick chọn trạng thái từng Subtask (Done/New/Skipped). Hệ thống tự cộng dồn lên cấp cha.",
            ja: "希望のタスク項目を押すとスライド引き出しメニューが出現。責任者と目標配分時間が一覧化されています。終了時に「実績時間（Actual time / 分）」を入力して、チェックを完了にします。実作業時間が自動集計されます。"
          }
        },
        {
          title: { en: "Persisted Filters (Session Cached)", vi: "Bộ lọc thông minh (Filters)", ja: "Session-Cache対応スマートフィルター" },
          text: {
            en: "Filters are intelligently saved inside Session Storage, retaining your workspace query parameters even throughout complete page reloads. Filter by assigned name, project keyword, unique 6-digit ID, tags, or recurrences.",
            vi: "Hệ thống lưu lịch sử lọc vào Session Storage giúp duy trì bộ lọc dù bạn f5 tải lại trang. Các bộ lọc bao gồm: Tìm kiếm theo Tên công việc/Mã số ID (Mã 6 chữ số), Bộ lọc Người phụ trách, Dự án liên kết, Tag nghiệp vụ, Nhóm thực thi và Loại tần suất.",
            ja: "絞り込み操作履歴はブラウザのSession Storageにスマートに保存されます。ページ全体を再読み込みしても絞り込み条件が崩れません。タスク名・6桁固有ID記号・プロジェクト分類・チーム・所属メンバー一覧からの直近抽出に対応。"
          }
        },
        {
          title: { en: "Direct Action Submit & Task Skipping", vi: "Hoàn thành trực tiếp & Bỏ qua (Skip Task)", ja: "直接アクション提出と個別タスクの「スキップ」" },
          text: {
            en: "Operators can instantly mark lines Done using the direct Submit action. Alternatively, flag a task as Skip if localized bank holidays or client structural pauses waive specific operational responsibilities for that day.",
            vi: "Bạn có thể nhấp chuột trực tiếp vào nút hoàn thành ở dòng ngoài danh sách (Nút Submit) để nhanh chóng đánh dấu Done, hoặc thực hiện Bỏ qua (Skip) nếu ngày hôm đó có kỳ nghỉ và nghiệp vụ của khách hàng không yêu cầu chạy.",
            ja: "各行外郭にある「Submit（提出）」ボタンをクリックすれば、一発完了チェックが可能。また、先方の突発休業や、運行する必要のない日付（休日）は、理由として「Skip（スキップ）」を選択して業務を安全に割愛できます。"
          }
        }
      ],
      tip: {
        title: { en: "Batch Adjustment: Quick Skip Mode (Admin/Master Only)", vi: "Hệ thống Bỏ Qua Nhanh Hàng Loạt (Quick Skip Mode - Admin/Master)", ja: "一括スキップ機能：一括スキップモード（管理者／マスター専用）" },
        text: {
          en: "In the To-do List layout, Admin and Master accounts can perform rapid batch skip adjustments:\n\n" +
              "• **Quick Skip Mode:** Click the orange 'Skip' button at the top header to activate the selection mode. The leftmost column will render checkbox selectors. Check off all the tasks you want to skip, and click the 'Skip (X)' button at the top-right to instantly bypass them in a single batch operation. This is especially helpful during client holidays or system pauses.",
          vi: "Trong giao diện To-do List, tài khoản Admin và Master được hỗ trợ chế độ loại bỏ nhanh hàng loạt công việc định kỳ:\n\n" +
              "• **Chế độ Quick Skip:** Nhấp chuột vào nút 'Skip' màu cam ở góc trên bên phải để kích hoạt. Hệ thống sẽ hiển thị ô chọn (checkbox) ở cột ngoài cùng bên trái. Tiến hành tick chọn vào những việc tương ứng muốn bỏ qua và nhấp lại vào nút 'Skip (X)' để ngay lập tức bỏ qua hàng loạt công việc đó. Tính năng này vô cùng thuận tiện khi khách hàng bước vào dịp nghỉ lễ hoặc tạm ngưng vận hành mẫu nghiệp vụ.",
          ja: "ToDoリスト一覧において、管理者およびマスターアカウントは、一括スキップモードを使用して迅速に現場タスクをスキップ調整することが可能です：\n\n" +
              "• **一括スキップモード（管理者／マスター専用）:** 画面右上部のオレンジ色の「Skip」ボタンをクリックすると。左端に選択チェックボックスがポップアップ出現します。スキップ対象のタスク群をすべてチェックし、再度「Skip (X)」をクリックすれば、一発で一括スキップ処理が実行されます。連休中の業務割愛や、一部運行の一斉保留に大変便利です。"
        }
      }
    },
    manager: {
      title: {
        en: "Task Manager Module (Rule Engine)",
        vi: "Menu Task Manager (Cấu hình mẫu việc định kỳ)",
        ja: "タスクマネージャーメニュー（定義ルールエンジン）"
      },
      desc: {
        en: "The control desk for managers and masters. Establish strict Task Templates mapped to precise recurrence rules to continuously feed personnel timelines.",
        vi: "Dành cho Admin và Master quản lý và điều phối luồng quy trình. Nơi định nghĩa các Mẫu định hướng công việc (Task Templates) có tần suất để cấp phát tự động xuống To-do List của nhân viên.",
        ja: "実務設計担当やチーム経営レベル専用の登録パネル。作業の周期数・時間枠を設定し、現場カレンダーに安定的なToDo業務ラインを自動プロットします。"
      },
      subTitle: {
        en: "Master Configuration Toolkit Features:",
        vi: "Các tính năng nghiệp vụ chủ chốt:",
        ja: "管理マスタ機能の特徴点："
      },
      cards: [
        {
          title: { en: "1. Advanced Recurrence Schemas", vi: "1. Thiết lập tần suất khoa học", ja: "1. 確実な定期運行エンジン" },
          text: {
            en: "Configure DAILY (continuous daily routines), WEEKLY (target weekdays e.g. Mon/Wed/Fri), MONTHLY (set days inside each calendar cycle e.g. 10th and 25th), or ONETIME (one off, custom specific date occurrences).",
            vi: "Chọn cấu hình loại DAILY (hàng ngày), WEEKLY (chạy vào các thứ cố định hàng tuần ví dụ Thứ 2, Thứ 4, Thứ 6), MONTHLY (chạy vào các ngày định sẵn trong tháng ví dụ ngày 10 và ngày 25 hàng tháng), hoặc ONETIME (chỉ phát sinh một lần duy nhất vào một mốc ngày đã thiết lập).",
            ja: "「毎日運行」、「指定曜日（例：木曜日と月曜日のみ等）」、「月次の指定締め日（例：毎月20日・末日など）」、もしくは特定１日のみ起動する「単発（Onetime）」から正確に選べます。"
          }
        },
        {
          title: { en: "2. Struct Schema Version Controls", vi: "2. Lịch sử thay đổi kiến trúc (Timeline Versions)", ja: "2. バージョン不変制御のタイムライン" },
          text: {
            en: "Enterprise Grade: Rewriting subtask items, checklists, or person assignments creates a new architecture active from today. Historical tasks on date grids retain their older structural parameters to maintain historical analytics validity.",
            vi: "Đặc biệt chuyên nghiệp: khi biên tập thay đổi Cấu trúc Subtasks hay phân công nhân vật lực của một mẫu có sẵn, hệ thống sẽ lưu cấu trúc cũ kèm mốc thời gian áp dụng. Khi hiển thị công việc lịch sử cũ trong To-do List, cấu trúc cũ vẫn giữ nguyên, bảo toàn tính chuẩn xác cho logs nghiệp vụ.",
            ja: "高いトレーサビリティ設計：途中でひな形の小手順を改修しても、過去の確認実績ログの定義は一切壊れません。その改修を行った日付以降の将来タスクにのみ新構成が反映されるため、歴史レポートの正当性がしっかりと守られます。"
          }
        },
        {
          title: { en: "3. Status Flag Pause Toggle", vi: "3. Kích hoạt / Tắt mẫu vận hành (Status ON/OFF)", ja: "3. ステータス変更による将来発行保留" },
          text: {
            en: "Instead of permanent deletion which fractures historical dashboards, deactivate items via the Status toggle (ON/OFF) to suspend future recurrences while maintaining historic analytical metrics.",
            vi: "Khi một nghiệp vụ của khách hàng kết thúc hoặc cần đình bản tạm thời một mẫu, quản trị viên bật/tắt cột Status ON/OFF. Khác với chức năng Xóa, các mốc đã từng ghi nhận trên lịch biểu cũ (lịch sử) vẫn được bảo toàn nguyên vẹn trên cơ sở dữ liệu.",
            ja: "クライアント企業の契約休止などがあった場合、元のルール定義を削除してしまうのではなく「Status ON/OFF」にて休止フラグを切り替えます。これにより将来スケジュールから切り離され、これまでの統計記録は不変のまま維持されます。"
          }
        },
        {
          title: { en: "4. Rapid Template Cloners", vi: "4. Sao chép nhanh (Clone / Quick Create)", ja: "4. スピードひな形コピー（Cloneボタン）" },
          text: {
            en: "Trigger Quick Create under any template's Actions dropdown. It copies properties, teams, active projects, tag elements, and subtasks into a draft so you only have to customize titles or specify new users.",
            vi: "Nhấp chọn Action (nút 3 chấm) -> Chọn Quick Create. Hệ thống tự điền toàn bộ thông tin lặp, Dự án, Tag, Subtasks mẫu của mẫu cũ để bạn chỉ cần sửa tiêu đề hoặc chuyển đổi nhân sự mới, cực kỳ rút gọn quy trình thiết lập dự án mới.",
            ja: "特定行の「アクション」をクリックして「クイック複製 (Quick Create)」をクリック。全ての依存関係、割り振られたプロジェクト、作業項目がフルロードされます。あとは変更点や別担当者を再配置するだけです。"
          }
        }
      ],
      excel: {
        title: { en: "Unicode CSV Exporter Tooling", vi: "Bảng Xuất Báo Cáo excel (Export CSV)", ja: "CSVエクスポート（Unicode UTF-8）" },
        text: {
          en: "Export refined spreadsheets as full UTF-8 Unicode CSV files matching the configured workspace filter parameters precisely, simplifying external executive reporting.",
          vi: "Màn hình hỗ trợ nút Export dữ liệu động ra tệp tin CSV chuẩn mã hóa Unicode UTF-8. Bộ lọc màn hình đang lọc danh mục như thế nào (lọc dự án A, người phụ trách B), file tải về sẽ lọc chính xác tệp bản ghi đó giúp báo cáo trực tiếp rất tiện dụng.",
          ja: "各データをエクセルで加工したりクライアント報告に利用できるよう、「Export CSV」機能を配置。検索ボックス、プロジェクト、チーム等でフィルターしたままの表示範囲を安全なUnicode UTF-8形式でエクスポート可能です。"
        }
      }
    },
    approveTask: {
      title: {
        en: "Approve Task Module (Governance & Quality Control)",
        vi: "Menu Approve Task (Kiểm duyệt yêu cầu)",
        ja: "タスク承認メニュー（ガバナンスと変更管理）"
      },
      desc: {
        en: "Governs the template lifecycle to prevent direct unauthorized modifications to vital workflows. Any addition or structural update must go through a rigid peer-review and approval loop before committing to the active task pool.",
        vi: "Quản lý vòng đời của các mẫu công việc nhằm ngăn chặn các chỉnh sửa trực tiếp, trái phép đối với các quy trình hoạt động quan trọng. Mọi yêu cầu thêm mới hoặc cập nhật cấu trúc đều cần qua phê duyệt của cấp quản trị.",
        ja: "重要な業務規則に対する無許可の直接改変を防ぎ、テンプレートのライフサイクルを一括統制します。新規作成や構造変更は、稼働中のタスク群に組み込まれる前に管理者による相互審査と承認フローを経過する必要があります。"
      },
      subTitle: {
        en: "Operational Governance & Creator Capabilities:",
        vi: "Quy trình kiểm duyệt và tính năng hữu ích:",
        ja: "主なガバナンス機能 và 承認アクション："
      },
      cards: [
        {
          title: { en: "Request & Draft Creation", vi: "Đề xuất thêm mới & chỉnh sửa", ja: "新規起票・変更のドラフト提出" },
          text: {
            en: "Standard operators can propose new task templates or draft modifications to existing templates. These requests reside in a 'PENDING' queue, isolated from active To-do lists, preserving operational tranquility.",
            vi: "Nhân viên có thể đề xuất mẫu công việc mới hoặc gửi bản thảo chỉnh sửa mẫu hiện tại. Các yêu cầu này sẽ nằm ở trạng thái 'PENDING' (Chờ duyệt), không ảnh hưởng đến To-do List đang chạy.",
            ja: "一般ユーザーは新規タスクの作成、または既存のタスク定義の一部変更を申請（ドラフト送信）できます。承認されるまでは「PENDING」状態として隔離され、現場のToDoに不用意に適用されることはありません。"
          }
        },
        {
          title: { en: "Accept & Apply Modification", vi: "Xét duyệt và áp dụng nhanh chóng", ja: "承認処理と迅速な自動展開" },
          text: {
            en: "Admin and Master accounts have exclusive authority to approve requests. Selecting 'Accept Create' creates the task, while 'Accept Edit' seamlessly merges structures. History records are neatly preserved.",
            vi: "Tài khoản QL Trực tiếp hoặc Quản trị có quyền phê duyệt riêng biệt. Nhấp 'Accept Create' để kích hoạt mẫu mới, hoặc 'Accept Edit' để đồng bộ cấu trúc mới mà vẫn bảo toàn logs dữ liệu lịch sử.",
            ja: "管理者およびマスターアカウントのみが承認決定を行えます。「Accept Create」で新規テンプレートが公式に公開され、「Accept Edit」で既存設定が安全に入れ替わります。過去の記録実績はそのまま保護されます。"
          }
        },
        {
          title: { en: "Reject with Reasoned Responses", vi: "Từ chối đề xuất kèm lý do rõ ràng", ja: "理由を添えた却下（Reject）と通知" },
          text: {
            en: "If a proposal has errors, administrators can click 'Reject Request' and provide constructive rejection comments. This updates the request status to 'REJECTED' so the submitter can review reasons, fix issues, and submit a re-approval.",
            vi: "Nếu tài liệu nghiệp vụ chưa đạt chuẩn, Quản lý có thể 'Reject' và nhập lý do từ chối. Yêu cầu chuyển sang trạng thái 'REJECTED' để người gửi dễ dàng theo dõi, điều chỉnh lại thông số và gửi phê duyệt lại.",
            ja: "要件に不備がある場合、管理者は理由を入力した上で却下できます。ステータスは「REJECTED」となり、作成申請者は却下理由を確認し、内容を修正して「再提出（Edit / Re-approve）」を行うことが可能です。"
          }
        },
        {
          title: { en: "Audit Logs Correlation", vi: "Tích hợp đồng bộ Audit Logs và Realtime", ja: "リアルタイム同期と監査証跡の自動生成" },
          text: {
            en: "Every approval or rejection instantly updates the system view across your team using realtime triggers. Additionally, the complete proposal trail is fully registered in the Audit Logs for governance compliance.",
            vi: "Mọi biến động phê duyệt hoặc từ chối đều cập nhật tức thời qua kết nối Realtime. Đồng thời, mọi lịch sử thay đổi liên quan đều được lưu vào Audit Logs để phục vụ công tác thanh kiểm tra của doanh nghiệp.",
            ja: "承認・却下の全履歴はリアルタイムでシステム全体に即時反映。さらにガバナンスと透明性の維持を目的として, 一連のアクション履歴が不変の「Audit Logs」に完全自動記録されます。"
          }
        }
      ]
    },
    dashboard: {
      title: {
        en: "Dashboard UI & Analytical Cockpit",
        vi: "Menu Dashboard (Báo cáo chỉ số hoạt động)",
        ja: "ダッシュボード分析（運行パフォーマンス監視）"
      },
      desc: {
        en: "Provides clear quantitative insights for administrators to audit work volumes, detect task density bottlenecks, and compute team duration metrics.",
        vi: "Cung cấp góc nhìn số liệu trực quan cho cấp quản lý để đánh giá khối lượng công việc, tính chu kỳ và hiệu suất sử dụng quỹ thời gian của đội ngũ nhân sự.",
        ja: "蓄積された数値実績をグラフィカルに定量化し、運行上の負荷の偏り、パフォーマンス統計などを多角的に監視・補正するためのコントロールディスプレイです。"
      },
      statTitle: {
        en: "Chronological Breakdown (Glossary of 5 Core Indicators):",
        vi: "Ý nghĩa 5 Chỉ số Tóm tắt (Overview Metrics):",
        ja: "表示される5大指標とその役割意味合い："
      },
      stats: [
        { label: "Total Tasks", text: { en: "Aggregated task sheets identified within range parameter selections.", vi: "Tổng số đầu việc phân bổ trong thời gian biểu đã chọn lọc.", ja: "期間内における総タスク構成数です。" } },
        { label: "Completed", text: { en: "Work pieces successfully flagged Done by personnel.", vi: "Số việc đã giải quyết xong triệt để.", ja: "担当ユーザーから提出（Submit/Done）が済んだ稼働総数です。" } },
        { label: "Skipped", text: { en: "Planned assignments bypassed due to holidays or skip configs.", vi: "Số việc được cho phép bỏ qua (Skip).", ja: "状況不必要の判断に基づき、スキップ（Skipped）処理に決まった項目行です。" } },
        { label: "Est. Hours", text: { en: "Expectancy time blocks formulated within design templates (Hours).", vi: "Tổng quỹ thời gian dự tính định nghĩa theo mẫu.", ja: "マスターテンプレートの設定に基づく合計計画時間（予測値）です。" } },
        { label: "Act. Hours", text: { en: "Operational time reported from onsite staff check sheets (Hours).", vi: "Thời gian thực tế vận dụng do nhân viên khai báo.", ja: "現場担当者がタスク引き出し内に自ら入力・保存した実績時間（総和）です。" } }
      ],
      roadmapTitle: {
        en: "Weekly Roadmap Mapping Diagram:",
        vi: "Weekly Roadmap (Lịch trình tuần tự):",
        ja: "週間タスクロードマップ（負荷マップ効果）:"
      },
      roadmapDesc: {
        en: "The visualization maps a full workweek (Mon-Fri) listing targeted tasks assigned to the chosen resource. Grouped cleanly by Daily, Weekly, Monthly, or One-time frequencies accompanied by their estimated duration minutes. Administrators can pinpoint operational bottle-necks on particular days and optimize tasks to eliminate overload points.",
        vi: "Hệ thống tự động loại trừ khoảng ngày đã lọc và dựng lại Lịch trình toàn tuần làm việc (Thứ Hai đến Thứ Sáu) của nhân viên đã chọn. Bản đồ công việc này phân loại thành các mức: Daily, Weekly, Monthly, Onetime cùng với quỹ thời gian Est tương ứng ngoài góc. Giúp admin nắm rõ khối lượng việc phân bổ có bị quá tải vào một ngày thứ cụ thể hay không để cơ cấu lại tối ưu.",
        ja: "選択したスタッフの月〜金曜日にかけてのタスク計画分布を自動計算してチャートライズ。日次（Daily）や月次（Monthly）に分類され、予定目安工数（分）をサイドに添えることで特定の曜日への業務集中、偏りを一目で特定し配置是正に活かせます。"
      }
    },
    settingsLogs: {
      title: {
        en: "Master Configuration & Operational Security Logs",
        vi: "Cài Đặt Danh Mục & Theo Dõi Lịch Sử Hoạt Động",
        ja: "システム調律マスタ ＆ 高度セキュリティ変更監査履歴"
      },
      desc: {
        en: "Provisions precise data schemas, user privilege administration, and tamper-proof action logs to guard workspace safety and performance transparency.",
        vi: "Đảm bảo tính chân thực, bảo mật và toàn vẹn dữ liệu cho toàn bộ hệ thống quản trị nội bộ.",
        ja: "データ整合性のガード、ユーザー特権割り当て、改ざん不可能の軌跡ログ。システムが完全に安全にクリーンに稼働するための保守ハブです。"
      },
      settingsTitle: {
        en: "System Settings Configs (Managers & Master access only)",
        vi: "Menu Settings (Cài đặt hệ thống - Quyền Master/Admin)",
        ja: "システム共通設定（マスター・管理者専用スペース）"
      },
      settingsCols: [
        {
          title: { en: "Profile Matrix (Users)", vi: "Quản lý nhân viên (Users Tab)", ja: "ユーザープロファイル配置 (Users)" },
          desc: {
            en: "Provision new accounts, map credentials to system roles (Master/Admin/User), and map users to specific enterprise Teams. Toggle Active/Inactive to immediately modify access.",
            vi: "Thêm mới nhân sự, chỉ định phân quyền (Master/Admin/User), xếp nhân viên vào các Nhóm (Teams) của công ty. Có thanh trượt chuyển trạng thái Active/Inactive cực kỳ linh hoạt.",
            ja: "新しい社員のアカウント登録。一般・管理・マスターロールを明示、会社部署の所属「Teams」へ振り分け。アカウント稼働ON/OFFを１タップで凍結可能。"
          }
        },
        {
          title: { en: "Referential Integrity Master Data", vi: "Dữ liệu gốc (Projects, Teams, Tags Trực Quan)", ja: "データマスター (Projects, Teams, Tags)" },
          desc: {
            en: "Control root Project pipelines, departments, and tagging attributes. Enforces relational safety bounds (e.g., locking tag deletion if templates reference them) to block runtime errors.",
            vi: "Lưu cấu trúc các đầu mã dữ liệu để khi tạo mẫu việc gán chuẩn hóa. Toàn bộ các danh mục này được ràng buộc tự động: ví dụ hệ thống khóa chức năng xóa Tag nếu có mẫu công việc vẫn đang dùng Tag đó, ngăn gãy vỡ dữ liệu liên quan.",
            ja: "プロジェクト、チーム、分類タグ等のマスタを中央制御。リレーショナル防御チェック：例えば稼働タスクに登録中のタグ項目は、マスターから強制排他削除がロックされデータの破断を防ぎます。"
          }
        }
      ],
      auditTitle: {
        en: "Continuous Immutable Audit Logs (All roles visible)",
        vi: "Menu Audit Log (Nhật ký hành vi - Dành cho mọi người dùng)",
        ja: "一連の全自動セキュリティ変更監査ログ（全スタッフ公開）"
      },
      auditDesc: {
        en: "Every critical action (such as creating profiles, editing task metrics, shifting subtasks, manual submissions) is permanently written here. Action schemas record exact change actions, target subjects, initiating profile metadata, and accurate UTC micro-timestamps to ease operations inquiries.",
        vi: "Mọi tương tác thay đổi có độ nhạy cảm cao như: Thêm nhân viên kì cựu, Chỉnh sửa thông tin công việc, Xếp lại thứ tự Subtask, Hoàn thành hay Gỡ mẫu việc đều tự động gửi thông báo chuẩn ghi lại trên Audit Logs bao gồm: Hành động là gì, Nội dung mô tả chi tiết, Tài khoản thực thi và mốc lịch chuẩn cụ thể. Giúp giải quyết nhanh chóng nếu phát sinh mâu thuẫn vận hành hoặc lỗi người dùng thiết lập.",
        ja: "新規人材の登用、タスク構造の書き換え、サブタスク順番チェンジ、および実績の手動完了チェックなど、各種運行上の重要作業が監査ログにリアルタイム不変に保存されます。何時・誰が・どのクライアントに関わる項目に変更を加えたかが、クリーンな環境で一覧表示され追跡解決に役立ちます。"
      }
    }
  };

  const tabs = [
    { id: 'INTRO' as GuideTab, label: t.tabs.INTRO[lang], icon: BookOpen },
    { id: 'TODO' as GuideTab, label: t.tabs.TODO[lang], icon: ClipboardList },
    { id: 'MANAGER' as GuideTab, label: t.tabs.MANAGER[lang], icon: SettingsIcon },
    { id: 'APPROVE_TASK' as GuideTab, label: t.tabs.APPROVE_TASK[lang], icon: CheckSquare },
    { id: 'DASHBOARD' as GuideTab, label: t.tabs.DASHBOARD[lang], icon: LayoutDashboard },
    { id: 'SETTINGS_LOGS' as GuideTab, label: t.tabs.SETTINGS_LOGS[lang], icon: History },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="bg-white border border-slate-100 rounded-2xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col relative z-10 overflow-hidden font-sans text-left user-guide-container"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-gradient-to-r from-slate-50 to-white gap-4">
              <div className="flex items-center gap-2.5 bg-transparent min-w-0 flex-1 mr-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
                  <HelpCircle size={18} />
                </div>
                <div className="min-w-0 text-left">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight leading-none truncate">{t.modalTitle[lang]}</h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold uppercase mt-1.5 tracking-wider leading-none truncate">
                    {t.modalSub[lang]}
                  </p>
                </div>
              </div>

              {/* Action Area: Language switcher followed by close button */}
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                {/* Language Switcher */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                  <div className="text-slate-400 pl-1.5 pr-0.5 shrink-0">
                    <Globe size={13} />
                  </div>
                  <div className="flex gap-0.5 select-none">
                    <button
                      type="button"
                      onClick={() => setLang('en')}
                      className={`w-[60px] sm:w-[68px] py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center justify-center flex items-center ${
                        lang === 'en' 
                          ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-100' 
                          : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => setLang('vi')}
                      className={`w-[60px] sm:w-[68px] py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center justify-center flex items-center ${
                        lang === 'vi' 
                          ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-100' 
                          : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                      }`}
                    >
                      Tiếng Việt
                    </button>
                    <button
                      type="button"
                      onClick={() => setLang('ja')}
                      className={`w-[60px] sm:w-[68px] py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center justify-center flex items-center ${
                        lang === 'ja' 
                          ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-100' 
                          : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                      }`}
                    >
                      日本語
                    </button>
                  </div>
                </div>

                {/* Always visible responsive Close Button */}
                <button 
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0 ml-1"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Menu Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-550/5 p-1.5 shrink-0 overflow-x-auto gap-1 select-none">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer relative ${
                      activeTab === tab.id 
                        ? 'text-indigo-600 bg-white shadow-sm border border-slate-200/40' 
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                    }`}
                  >
                    <Icon size={14} className={activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400'} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
              {/* TAB 1: INTRO */}
              {activeTab === 'INTRO' && (
                <div className="space-y-6 animate-in fade-in duration-200 text-left">
                  <div className="max-w-3xl">
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">{t.intro.welcome[lang]}</h3>
                    <p className="text-xs text-slate-550 mt-2 leading-relaxed">
                      {t.intro.desc[lang]}
                    </p>
                  </div>

                  {/* Operational loop step card flow */}
                  <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-5 space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{t.intro.flowTitle[lang]}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
                      {t.intro.flows.map((f, idx) => (
                        <div key={idx} className="bg-white p-4.5 rounded-lg border border-slate-150 flex flex-col justify-between shadow-sm">
                          <div>
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${idx === 2 ? 'text-emerald-500' : 'text-indigo-500'}`}>
                              {f.step[lang]}
                            </span>
                            <h5 className="font-bold text-slate-800 text-xs mt-1.5">{f.title[lang]}</h5>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{f.text[lang]}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Access Levels / Roles table info */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-2 border-b border-slate-200 flex items-center gap-1.5">
                      <ShieldAlert size={12} className="text-indigo-500" />
                      <span>{t.intro.roleTitle[lang]}</span>
                    </div>
                    <div className="divide-y divide-slate-150 bg-white">
                      {t.intro.roles.map((r, idx) => (
                        <div key={idx} className="p-4 flex flex-col md:flex-row md:items-center gap-2.5">
                          <span className={`w-32 px-2.5 py-0.5 rounded font-bold text-[10px] uppercase tracking-wide text-center shrink-0 ${r.color}`}>
                            {r.label[lang]}
                          </span>
                          <p className="text-xs text-slate-550 leading-relaxed md:ml-3">
                            {r.text[lang]}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TODO LIST */}
              {activeTab === 'TODO' && (
                <div className="space-y-6 animate-in fade-in duration-200 text-left">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                      <ClipboardList className="text-indigo-600" size={20} />
                      <span>{t.todo.title[lang]}</span>
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed mt-2.5 font-medium">
                      {t.todo.desc[lang]}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest pl-1.5 border-l-2 border-indigo-500">
                      {t.todo.subTitle[lang]}
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {t.todo.cards.map((c, i) => {
                        const iconSet = [Calendar, CheckCircle2, UserCheck, Clock];
                        const CardIcon = iconSet[i] || Calendar;
                        return (
                          <div key={i} className="p-4 bg-white border border-slate-150 rounded-xl space-y-2 shadow-sm">
                            <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
                              <CardIcon size={14} />
                              <span>{c.title[lang]}</span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {c.text[lang]}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-indigo-50/50 border border-indigo-100 p-4.5 rounded-2xl">
                      <h5 className="text-xs font-black text-indigo-950 flex items-center gap-1.5 uppercase tracking-wide">
                        <CheckSquare size={14} className="text-indigo-600" />
                        <span>{t.todo.tip.title[lang]}</span>
                      </h5>
                      <div className="text-xs text-indigo-900/80 mt-2.5 leading-relaxed whitespace-pre-line font-medium">
                        {t.todo.tip.text[lang]}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TASK MANAGER */}
              {activeTab === 'MANAGER' && (
                <div className="space-y-6 animate-in fade-in duration-200 text-left">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                      <SettingsIcon className="text-indigo-600" size={20} />
                      <span>{t.manager.title[lang]}</span>
                    </h3>
                    <p className="text-xs text-slate-550 leading-relaxed mt-2.5">
                      {t.manager.desc[lang]}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest pl-1.5 border-l-2 border-indigo-500">
                      {t.manager.subTitle[lang]}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {t.manager.cards.map((c, i) => (
                        <div key={i} className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-1.5 shadow-sm">
                          <h5 className="font-bold text-slate-800 text-xs text-indigo-600">
                            {c.title[lang]}
                          </h5>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            {c.text[lang]}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-amber-50/50 border border-amber-200/60 p-4.5 rounded-xl">
                      <h5 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <FileSpreadsheet size={14} className="text-amber-600 shrink-0" />
                        <span>{t.manager.excel.title[lang]}</span>
                      </h5>
                      <p className="text-xs text-amber-900/80 mt-1.5 leading-relaxed">
                        {t.manager.excel.text[lang]}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DASHBOARD */}
              {activeTab === 'DASHBOARD' && (
                <div className="space-y-6 animate-in fade-in duration-200 text-left">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                      <LayoutDashboard className="text-indigo-600" size={20} />
                      <span>{t.dashboard.title[lang]}</span>
                    </h3>
                    <p className="text-xs text-slate-550 leading-relaxed mt-2.5 font-medium">
                      {t.dashboard.desc[lang]}
                    </p>
                  </div>

                  <div className="space-y-5">
                    {/* Stat Breakdown cards */}
                    <div className="p-4 border border-slate-150 rounded-xl space-y-3.5 bg-white shadow-sm">
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-widest pl-1.5 border-l-2 border-indigo-500">
                        {t.dashboard.statTitle[lang]}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {t.dashboard.stats.map((s, idx) => {
                          const badgeColorMap = [
                            'text-slate-500', // Total tasks
                            'text-emerald-600', // Completed
                            'text-amber-600', // Skipped
                            'text-indigo-600', // Est hours
                            'text-emerald-600' // Act hours
                          ];
                          const textColorClass = badgeColorMap[idx] || 'text-slate-800';
                          return (
                            <div key={idx} className="bg-slate-50 p-3 rounded-lg text-left border border-slate-100">
                              <span className={`text-[10px] font-bold block leading-none uppercase ${textColorClass}`}>
                                {s.label}
                              </span>
                              <span className="text-[11px] text-slate-500 font-semibold mt-1.5 block leading-relaxed">
                                {s.text[lang]}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Weekly Roadmap element */}
                    <div className="p-4 border border-slate-150 rounded-xl space-y-2.5 bg-white shadow-sm">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest pl-1.5 border-l-2 border-indigo-500">
                        {t.dashboard.roadmapTitle[lang]}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {t.dashboard.roadmapDesc[lang]}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: SETTINGS LOGS */}
              {activeTab === 'SETTINGS_LOGS' && (
                <div className="space-y-6 animate-in fade-in duration-200 text-left">
                  <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                      <History className="text-indigo-600" size={20} />
                      <span>{t.settingsLogs.title[lang]}</span>
                    </h3>
                    <p className="text-xs text-slate-550 leading-relaxed mt-2.5 font-medium">
                      {t.settingsLogs.desc[lang]}
                    </p>
                  </div>

                  <div className="space-y-5">
                    {/* Settings options breakdown */}
                    <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-4 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <SettingsIcon size={14} className="text-indigo-600" />
                        <span>{t.settingsLogs.settingsTitle[lang]}</span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {t.settingsLogs.settingsCols.map((col, idx) => (
                          <div key={idx} className="space-y-1 bg-white p-3.5 rounded-lg border border-slate-100">
                            <h5 className="font-bold text-slate-800 text-xs">
                              {col.title[lang]}
                            </h5>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {col.desc[lang]}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Security Audit logs description */}
                    <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2 text-slate-800 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <History size={14} className="text-indigo-600" />
                        <span>{t.settingsLogs.auditTitle[lang]}</span>
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {t.settingsLogs.auditDesc[lang]}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50 select-none">
              <span className="text-[11px] text-slate-400 font-bold font-mono">
                {t.companyTag[lang]}
              </span>
              <button 
                onClick={onClose}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold tracking-wide cursor-pointer transition-colors shadow-md shadow-indigo-600/10"
              >
                {t.footerAck[lang]}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
