import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';
import CostumeListView from '../features/costumes/views/CostumeListView.vue';
import CostumeDetailView from '../features/costumes/views/CostumeDetailView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import AboutView from '../views/AboutView.vue';
import AdminCostumeListView from '../features/costumes/views/AdminCostumeListView.vue';
import AdminCostumeEditView from '../features/costumes/views/AdminCostumeEditView.vue';
import LoginView from '../features/auth/LoginView.vue';
import AdminUsersView from '../features/users/AdminUsersView.vue';

export const router = createRouter({
  history: typeof window === 'undefined' ? createMemoryHistory() : createWebHistory(),
  scrollBehavior(to, from, saved) {
    if (to.hash) return { el: to.hash, top: 88 };
    if (to.path === from.path && (to.path === '/costumes' || to.path === '/admin/costumes') && to.fullPath !== from.fullPath) {
      return false;
    }
    return saved || { top: 0 };
  },
  routes: [
    { path: '/', component: LoginView },
    { path: '/login', component: LoginView, props: { optional: true } },
    { path: '/about', component: AboutView, meta: { publicStatic: true } },
    { path: '/costumes', component: CostumeListView },
    { path: '/costumes/:id', component: CostumeDetailView },
    { path: '/admin/costumes', component: AdminCostumeListView, meta: { requiresEditor: true } },
    { path: '/admin/users', component: AdminUsersView, meta: { requiresAdmin: true } },
    { path: '/admin/costumes/new', component: AdminCostumeEditView, meta: { requiresEditor: true } },
    { path: '/admin/costumes/:id/edit', component: AdminCostumeEditView, meta: { requiresEditor: true } },
    { path: '/:pathMatch(.*)*', component: NotFoundView, meta: { publicStatic: true } },
  ],
});
