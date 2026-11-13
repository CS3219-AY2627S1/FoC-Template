package sg.edu.nus.foc.order.application;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import sg.edu.nus.foc.order.domain.*;
import sg.edu.nus.foc.order.domain.repository.*;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
class AdminApplyPenaltyServiceTest {
    @Test void storedPenaltyAndReceiptAreSavedWithoutAnyPeerOrPublisherDependency() {
        OrderRepository orders=mock(OrderRepository.class);CommandReceiptRepository receipts=mock(CommandReceiptRepository.class);
        OrderAuditLogger audit=mock(OrderAuditLogger.class);AdminApplyPenaltyService service=new AdminApplyPenaltyService(orders,receipts,audit);
        Instant now=Instant.now();Order order=Order.open("owner","books","p","d",5,30,now,now.plusSeconds(3600));order.accept("courier",0,now);
        when(orders.getForLifecycleUpdate(order.getId())).thenReturn(Optional.of(order));when(orders.save(order)).thenReturn(order);
        assertEquals(order,service.apply("apply",order.getId(),"courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"Wrong location","admin"));
        assertEquals(OrderStatus.ACCEPTED,order.getStatus());assertEquals(4,order.getAppliedPenaltyAmount());
        ArgumentCaptor<CommandReceipt> receipt=ArgumentCaptor.forClass(CommandReceipt.class);verify(receipts).save(receipt.capture());
        when(receipts.findExisting("APPLY_PENALTY","apply")).thenReturn(Optional.of(receipt.getValue()));
        service.apply("apply",order.getId(),"courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"Wrong location","admin");
        verify(orders,times(1)).save(order);
        assertThrows(OrderProblem.class,()->service.apply("apply",order.getId(),"courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"Changed","admin"));
        assertThrows(OrderProblem.class,()->service.apply(" ",order.getId(),"courier",0,PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,"Reason","admin"));
    }
}
