import { Component, NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DEFAULT_PROJECT } from '../../../features/project/project.const';
import { Project } from '../../../features/project/project.model';
import { MenuTreeKind } from '../../../features/menu-tree/store/menu-tree.model';
import { MenuTreeService } from '../../../features/menu-tree/menu-tree.service';
import { TreeDndComponent } from '../../../ui/tree-dnd/tree.component';
import { MagicNavConfigService } from '../magic-nav-config.service';
import { NavTreeItem } from '../magic-side-nav.model';
import { NavItemComponent } from '../nav-item/nav-item.component';
import {
  getProjectVisibilityIconColor,
  NavListTreeComponent,
} from './nav-list-tree.component';

const createProject = (
  overrides: Omit<Partial<Project>, 'theme'> & {
    theme?: Partial<Project['theme']>;
  },
): Project => ({
  ...DEFAULT_PROJECT,
  id: 'project-id',
  title: 'Project',
  ...overrides,
  theme: {
    ...DEFAULT_PROJECT.theme,
    ...overrides.theme,
  },
});

describe('getProjectVisibilityIconColor', () => {
  it('returns the project primary color for material icons', () => {
    const project = createProject({
      icon: 'work',
      theme: { primary: '#123456' },
    });

    expect(getProjectVisibilityIconColor(project)).toBe('#123456');
  });

  it('does not color emoji project icons', () => {
    const project = createProject({
      icon: '\u{1F680}',
      theme: { primary: '#123456' },
    });

    expect(getProjectVisibilityIconColor(project)).toBeNull();
  });

  it('uses the default material icon when a project has no icon', () => {
    const project = createProject({
      icon: undefined,
      theme: { primary: '#abcdef' },
    });

    expect(getProjectVisibilityIconColor(project)).toBe('#abcdef');
  });

  it('does not throw for a project persisted without a theme (#9139)', () => {
    // A project entity can reach the store with no `theme` at all. This helper
    // renders once per project in the side nav on every launch, and because
    // DEFAULT_PROJECT_ICON is not an emoji the theme branch is the DEFAULT
    // path — so an unguarded deref crashed the app at startup.
    // No `icon` here on purpose: that is the fall-through the comment
    // describes, so the fixture exercises the path it claims to.
    const project = createProject({});
    delete (project as unknown as Record<string, unknown>).theme;

    expect(getProjectVisibilityIconColor(project)).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [NavListTreeComponent],
  template: `<nav-list-tree
    [item]="item"
    [isExpanded]="isExpanded()"
  ></nav-list-tree>`,
})
class NavListTreeHostComponent {
  readonly item: NavTreeItem = {
    type: 'tree',
    id: 'projects',
    label: 'Projects',
    icon: 'list',
    treeKind: MenuTreeKind.PROJECT,
    tree: [],
  };
  readonly isExpanded = signal(true);
}

describe('NavListTreeComponent expand/collapse animation', () => {
  let fixture: ComponentFixture<NavListTreeHostComponent>;

  const getChildrenEl = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('.nav-children');
  const getTree = (): NavListTreeComponent =>
    fixture.debugElement.query(By.directive(NavListTreeComponent)).componentInstance;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavListTreeHostComponent, TranslateModule.forRoot()],
      providers: [
        provideAnimations(),
        provideRouter([]),
        {
          provide: MagicNavConfigService,
          useValue: {
            allUnarchivedProjects: signal([]),
            archivedProjectsCount: signal(0),
          },
        },
        { provide: MenuTreeService, useValue: {} },
      ],
    })
      .overrideComponent(NavListTreeComponent, {
        remove: { imports: [NavItemComponent, TreeDndComponent] },
        add: { schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(NavListTreeHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('does not animate the list on initial render', () => {
    expect(getChildrenEl()?.getAnimations().length).toBe(0);
  });

  it('animates the list when expanding via the header (#10471)', async () => {
    getTree().onHeaderClick();
    fixture.componentInstance.isExpanded.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    getTree().onHeaderClick();
    fixture.componentInstance.isExpanded.set(true);
    fixture.detectChanges();

    expect(getChildrenEl()?.getAnimations().length).toBeGreaterThan(0);
  });

  it('animates the list when collapsing via the header (#10471)', async () => {
    getTree().onHeaderClick();
    fixture.componentInstance.isExpanded.set(false);
    fixture.detectChanges();

    // The :leave animation keeps the element in the DOM until it finishes.
    const leavingEl = getChildrenEl();
    expect(leavingEl).not.toBeNull();
    expect(leavingEl?.getAnimations().length).toBeGreaterThan(0);

    await Promise.all(leavingEl!.getAnimations().map((a) => a.finished));
    // The engine detaches the element in a task queued after the animation ends.
    await new Promise((resolve) => setTimeout(resolve));
    expect(getChildrenEl()).toBeNull();
  });
});
