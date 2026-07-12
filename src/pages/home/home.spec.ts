import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { Home } from './home';
import { WorkspaceRepository } from '../../core/workspace-repository';
import { AuthService } from '../../core/auth-service';
import { BoardImageService } from '../../core/board-image-service';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        {
          provide: WorkspaceRepository,
          useValue: { isConfigured: false, loadForUser: async () => [], saveNode: async () => {}, deleteNode: async () => {} },
        },
        {
          provide: AuthService,
          useValue: { user: signal(null), isSignedIn: signal(false) },
        },
        {
          provide: BoardImageService,
          useValue: { urlsForPositions: async () => [] },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
