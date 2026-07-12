# Cache Contract

After a successful profile write, the service publishes `profile.changed`. Readers may serve cached data until that invalidation event is received. Once received, the next read must reload the profile.
