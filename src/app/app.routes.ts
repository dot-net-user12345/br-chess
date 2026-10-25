import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('../pages/home/home').then((m) => m.Home),
    title: 'Home',
  },
  {
    path: 'positions',
    loadComponent: () =>
      import('../pages/position-search/position-search').then((m) => m.PositionSearch),
    title: 'Position search',
  },
  {
    path: 'privacy',
    loadComponent: () => import('../pages/privacy/privacy').then((m) => m.PrivacyPolicy),
    title: 'Privacy Policy',
  },
  { path: '**', redirectTo: '' },
];
