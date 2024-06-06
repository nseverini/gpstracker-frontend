import {
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  catchError,
  filter,
  map,
  switchMap,
  take,
  throwError,
} from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AuthToken } from '../models/auth-token';
import snakecaseKeys from 'snakecase-keys';
import camelcaseKeys from 'camelcase-keys';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  let isRefreshing = false;
  let accessToken$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >(null);
  const router = inject(Router);
  const authService = inject(AuthService);
  const requestCloned = addHeaders(request, authService.getAccessToken());

  return next(requestCloned).pipe(
    map((response) => {
      if (response instanceof HttpResponse) {
        return response.clone({ body: camelcaseKeys(request.body as {}) });
      } else {
        return response;
      }
    }),
    catchError((error) => {
      if (error.status == 401) {
        if (authService.isLoggedIn()) {
          return handleError401(
            requestCloned,
            next,
            isRefreshing,
            authService,
            router,
            accessToken$
          );
        } else {
          redirectToLogin(router);
          return throwError(() => error);
        }
      } else {
        router.navigate(['/error/' + error.status]);
        return throwError(() => error);
      }
    })
  );
};

function addHeaders(
  request: HttpRequest<unknown>,
  token: string | null
): HttpRequest<unknown> {
  return request.clone({
    body: snakecaseKeys(request.body as {}),
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function handleError401(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  isRefreshing: boolean,
  authService: AuthService,
  router: Router,
  accessToken$: BehaviorSubject<string | null>
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    accessToken$.next(null);

    return authService.refreshToken().pipe(
      switchMap((authToken: AuthToken) => {
        isRefreshing = false;
        accessToken$.next(authToken.refresh);
        return next(addHeaders(request, authService.getAccessToken()));
      }),
      catchError((error) => {
        isRefreshing = false;
        authService.logout();
        redirectToLogin(router);
        return throwError(() => error);
      })
    );
  } else {
    return accessToken$.pipe(
      filter((accessToken) => accessToken !== null),
      take(1),
      switchMap((accessToken) => next(addHeaders(request, accessToken)))
    );
  }
}

function redirectToLogin(router: Router): void {
  router.navigate(['/login'], {
    queryParams: { returnUrl: router.routerState.snapshot.url },
  });
}
