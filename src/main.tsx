import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Phương án A: Xóa bộ lọc lưu trong sessionStorage khi tải lại trang toàn bộ (F5)
// Điều này giúp giữ bộ lọc khi chuyển đổi tab trong SPA, nhưng sẽ reset hoàn toàn về mặc định khi người dùng bấm F5 reload.
const filterKeys = [
  'todo_searchQuery',
  'todo_filterAssignee',
  'todo_filterTag',
  'todo_filterProject',
  'todo_filterTeam',
  'todo_filterTodoStatus',
  'todo_filterTaskType',
  'todo_startDate',
  'todo_endDate',
  
  'mgr_searchQuery',
  'mgr_filterPersonnel',
  'mgr_filterTag',
  'mgr_filterProject',
  'mgr_filterTeam',
  'mgr_filterStatus',
  'mgr_filterTaskType',
  
  'db_filterPersonnel',
  'db_filterProject',
  'db_filterTag',
  'db_filterTeam',
  'db_startDate',
  'db_endDate',
  'db_filterTaskType'
];

filterKeys.forEach(key => {
  sessionStorage.removeItem(key);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
