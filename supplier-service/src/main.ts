// Container entrypoint: starts the REST API and the gRPC server in one process,
// so supplier-service runs as a single container.
import './index';
import '../grpc/src/index';
