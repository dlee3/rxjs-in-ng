import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';

import { fromPromise } from 'rxjs/observable/fromPromise';
import { of } from 'rxjs/observable/of';
import { timer } from 'rxjs/observable/timer';

import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { CollectionObject, ArtObject, RakiObject } from './rakiCollection';

const key = '4a3Fxmua';

const serialize = o =>
  Object.keys(o).reduce(
    (search, k) => (search += `${k}=${encodeURIComponent(o[k])}&`),
    ''
  );

const collection = searchObj =>
  `https://www.rijksmuseum.nl/api/en/collection/?${serialize(
    searchObj
  )}key=${key}&format=json`;

const detail = detailNumber =>
  `https://www.rijksmuseum.nl/api/en/collection/${detailNumber}?key=${key}&format=json`;

@Injectable()
export class RakiService {
  private artCount = 4000;
  private detailNumber = new Subject<string | undefined>();

  detail$: Observable<RakiObject.ArtDetailObject[]> = this.detailNumber.pipe(
    switchMap(
      number => number ?
        this.http.get<RakiObject.RootObject>(detail(number)).pipe(
          map(r => [r.artObject])
        ) : of([])
    )
  );

  private selection = {
    p: 0,
    ps: 1,
    type: 'painting'
  };

  randomImage$ = this.http.get<CollectionObject>(collection(this.selection)).pipe(
    tap(r => (this.artCount = r.count)),
    switchMap(() => timer(0, 10000)),
    switchMap(() => this.getArtObject$),
    switchMap(artObject =>
      fromPromise(this.preload(artObject.webImage.url))
    )
  );

  private getArtObject$: Observable<ArtObject> = Observable.create(obs => {
    obs.next({
      ...this.selection,
      p: Math.floor(Math.random() * this.artCount)
    });
    obs.complete();
  })
  .pipe(
    switchMap(selection => this.http.get<CollectionObject>(collection(selection))
      .pipe(
        map(r => r.artObjects[0]),
        catchError(() =>
          timer(500).pipe(
            switchMap(() => this.getArtObject$)
          )
        )
      )
    ),
    switchMap((artObject: ArtObject) =>
      artObject.webImage &&
      artObject.webImage.url ? of(artObject) : this.getArtObject$
    )
  );

  constructor(private http: HttpClient) {}

  loadDetail(objectNumber: string | undefined) {
    this.detailNumber.next(objectNumber);
  }

  artist(q) {
    console.log(q, serialize({ q }));
    return this.http.get<CollectionObject>(collection({ q })).pipe(
      map(r => r.artObjects),
      map((artObjects: ArtObject[]) =>
        artObjects.reduce(
            (acc, e) => (e.hasImage ? acc.concat(e) : acc),
            []
        )
      ),
      tap(r => console.log(r))
    );
  }

  private preload(url) {
    return new Promise((resolve, reject) => {
      const resolveWithUrl = () => resolve(`url(${url})`);
      const img = document.createElement('img');
      img.addEventListener('load', resolveWithUrl);
      img.addEventListener('error', reject);
      img.src = url;
    });
  }
}
