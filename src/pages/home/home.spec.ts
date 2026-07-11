import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Home } from './home';
import { WorkspaceRepository } from '../../core/workspace-repository';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        {
          provide: WorkspaceRepository,
          useValue: { isConfigured: false, loadAll: async () => [], saveNode: async () => {}, deleteNode: async () => {} },
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
