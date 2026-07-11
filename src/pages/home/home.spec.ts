import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Home } from './home';
import { PageStoreService } from '../../core/page-store-service';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        {
          provide: PageStoreService,
          useValue: { isConfigured: false, savePage: async () => 'test-id' },
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
