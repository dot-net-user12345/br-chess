import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('../pages/home/home').then((m) => m.Home),
    title: 'Home',
  },
  {
    path: 'privacy',
    loadComponent: () => import('../pages/privacy/privacy').then((m) => m.PrivacyPolicy),
    title: 'Privacy Policy',
  },
  { path: '**', redirectTo: '' },
];
